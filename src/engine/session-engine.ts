import type { BlockSpec, BlockType, EngineStatus, PhaseKind } from './types'

/**
 * One timed step of a session. The whole session is flattened into a list of
 * segments up front, so timing is a pure function of "active time elapsed".
 */
export interface Segment {
  kind: Exclude<PhaseKind, 'idle' | 'done'>
  blockIndex: number
  blockType: BlockType
  /** 1-based set number within the block. */
  set: number
  /** 1-based rep number within the set (0 for rest). */
  rep: number
  durationMs: number
}

export interface Snapshot {
  status: EngineStatus
  phase: PhaseKind
  blockIndex: number
  blockType: BlockType | null
  set: number
  totalSets: number
  rep: number
  totalReps: number
  phaseDurationMs: number
  phaseRemainingMs: number
  /** 0 → 1 through the current phase. */
  phaseProgress: number
  totalDurationMs: number
  totalRemainingMs: number
  /** Time spent running (pauses excluded). */
  activeElapsedMs: number
}

export interface PhaseChange {
  type: 'phase'
  segmentIndex: number
  phase: PhaseKind
  /** Active-time at which this phase began. */
  atActiveMs: number
}

export function buildTimeline(blocks: readonly BlockSpec[]): Segment[] {
  const segments: Segment[] = []
  blocks.forEach((block, blockIndex) => {
    const reps = Math.max(0, Math.floor(block.reps))
    const sets = Math.max(0, Math.floor(block.sets))
    if (reps === 0 || sets === 0) return
    for (let set = 1; set <= sets; set++) {
      for (let rep = 1; rep <= reps; rep++) {
        const base = { blockIndex, blockType: block.type, set, rep }
        segments.push({ ...base, kind: 'squeeze', durationMs: secToMs(block.holdSec) })
        segments.push({ ...base, kind: 'relax', durationMs: secToMs(block.relaxSec) })
      }
      const lastSetOfBlock = set === sets
      const lastBlock = blockIndex === lastNonEmptyBlock(blocks)
      const restMs = secToMs(block.restBetweenSetsSec)
      // Rest between sets, and between blocks; never after the final set.
      if (restMs > 0 && !(lastSetOfBlock && lastBlock)) {
        segments.push({ blockIndex, blockType: block.type, set, rep: 0, kind: 'rest', durationMs: restMs })
      }
    }
  })
  return segments.filter((s) => s.durationMs > 0)
}

function lastNonEmptyBlock(blocks: readonly BlockSpec[]): number {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].reps > 0 && blocks[i].sets > 0) return i
  }
  return -1
}

function secToMs(sec: number): number {
  return Math.max(0, Math.round(sec * 1000))
}

export function totalDurationMs(blocks: readonly BlockSpec[]): number {
  return buildTimeline(blocks).reduce((sum, s) => sum + s.durationMs, 0)
}

/**
 * Framework-free session state machine: idle → squeeze ⇄ relax → rest → … → done.
 *
 * Every method takes the current wall-clock time (`now`, ms). Progress is
 * derived from timestamps rather than counted ticks, so a backgrounded tab
 * that stops firing timers catches up exactly on the next `tick`.
 */
export class SessionEngine {
  readonly blocks: readonly BlockSpec[]
  readonly segments: readonly Segment[]
  readonly totalDurationMs: number

  private _status: EngineStatus = 'idle'
  private startedAt = 0
  private pausedAt = 0
  private pausedTotal = 0
  private index = 0
  /** Active-time at which the current segment began. */
  private segmentStart = 0
  private endedAtActive = 0
  private _endedEarly = false
  private repsDone: number[]

  constructor(blocks: readonly BlockSpec[]) {
    this.blocks = blocks.map((b) => ({ ...b }))
    this.segments = buildTimeline(this.blocks)
    this.totalDurationMs = this.segments.reduce((sum, s) => sum + s.durationMs, 0)
    this.repsDone = this.blocks.map(() => 0)
  }

  get status(): EngineStatus {
    return this._status
  }

  get endedEarly(): boolean {
    return this._endedEarly
  }

  /** Reps whose squeeze phase ran to completion, per block. */
  get repsCompleted(): readonly number[] {
    return this.repsDone
  }

  start(now: number): PhaseChange[] {
    if (this._status !== 'idle') return []
    this.startedAt = now
    this.pausedTotal = 0
    this.index = 0
    this.segmentStart = 0
    if (this.segments.length === 0) {
      this._status = 'done'
      return [{ type: 'phase', segmentIndex: 0, phase: 'done', atActiveMs: 0 }]
    }
    this._status = 'running'
    return [this.changeEvent()]
  }

  pause(now: number): PhaseChange[] {
    if (this._status !== 'running') return []
    const events = this.tick(now)
    if (this.status === 'running') {
      this._status = 'paused'
      this.pausedAt = now
    }
    return events
  }

  resume(now: number): void {
    if (this._status !== 'paused') return
    this.pausedTotal += Math.max(0, now - this.pausedAt)
    this._status = 'running'
  }

  /** Jump to the start of the next phase. */
  skip(now: number): PhaseChange[] {
    if (this._status !== 'running' && this._status !== 'paused') return []
    const events = this._status === 'running' ? this.tick(now) : []
    if (this.isFinished()) return events
    const active = this.activeAt(now)
    this.index++
    this.segmentStart = active
    events.push(this.isFinished() ? this.finish(active) : this.changeEvent())
    return events
  }

  /** Stop before the end. Progress so far is kept. */
  end(now: number): PhaseChange[] {
    if (this._status === 'idle' || this._status === 'done') return []
    const events = this._status === 'running' ? this.tick(now) : []
    if (this.isFinished()) return events
    this._endedEarly = true
    events.push(this.finish(this.activeAt(now)))
    return events
  }

  /**
   * Advance to `now`. Returns every phase that began since the last call, in
   * order (several if the tab was asleep across multiple phases).
   */
  tick(now: number): PhaseChange[] {
    if (this._status !== 'running') return []
    const active = this.activeAt(now)
    const events: PhaseChange[] = []
    while (!this.isFinished() && active - this.segmentStart >= this.segments[this.index].durationMs) {
      const seg = this.segments[this.index]
      if (seg.kind === 'squeeze') this.repsDone[seg.blockIndex]++
      this.segmentStart += seg.durationMs
      this.index++
      events.push(this.isFinished() ? this.finish(this.segmentStart) : this.changeEvent())
    }
    return events
  }

  snapshot(now: number): Snapshot {
    const active = this.activeAt(now)
    const seg = this.isFinished() ? undefined : this.segments[this.index]
    const phase: PhaseKind = this._status === 'idle' ? 'idle' : seg ? seg.kind : 'done'
    const ref = seg ?? this.segments[Math.min(this.index, this.segments.length - 1)]
    const block = ref ? this.blocks[ref.blockIndex] : undefined
    const inPhase = seg && this._status !== 'idle' ? Math.min(seg.durationMs, Math.max(0, active - this.segmentStart)) : 0
    const phaseDurationMs = seg?.durationMs ?? 0
    let after = 0
    for (let i = this.index + 1; i < this.segments.length; i++) after += this.segments[i].durationMs
    const totalRemainingMs =
      this._status === 'idle' ? this.totalDurationMs : seg ? phaseDurationMs - inPhase + after : 0
    return {
      status: this._status,
      phase,
      blockIndex: ref?.blockIndex ?? 0,
      blockType: ref?.blockType ?? null,
      set: ref?.set ?? 0,
      totalSets: block?.sets ?? 0,
      rep: ref?.rep ?? 0,
      totalReps: block?.reps ?? 0,
      phaseDurationMs,
      phaseRemainingMs: phaseDurationMs - inPhase,
      phaseProgress: phaseDurationMs > 0 ? inPhase / phaseDurationMs : 1,
      totalDurationMs: this.totalDurationMs,
      totalRemainingMs,
      activeElapsedMs: this._status === 'done' ? this.endedAtActive : this._status === 'idle' ? 0 : active,
    }
  }

  private activeAt(now: number): number {
    if (this._status === 'idle') return 0
    if (this._status === 'done') return this.endedAtActive
    const pausedNow = this._status === 'paused' ? Math.max(0, now - this.pausedAt) : 0
    return Math.max(0, now - this.startedAt - this.pausedTotal - pausedNow)
  }

  private isFinished(): boolean {
    return this.index >= this.segments.length
  }

  private finish(atActive: number): PhaseChange {
    this.index = this.segments.length
    this._status = 'done'
    this.endedAtActive = atActive
    return { type: 'phase', segmentIndex: this.segments.length, phase: 'done', atActiveMs: atActive }
  }

  private changeEvent(): PhaseChange {
    return {
      type: 'phase',
      segmentIndex: this.index,
      phase: this.segments[this.index].kind,
      atActiveMs: this.segmentStart,
    }
  }
}
