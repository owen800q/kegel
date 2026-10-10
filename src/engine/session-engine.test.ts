import { describe, expect, it } from 'vitest'
import { SessionEngine, buildTimeline, totalDurationMs } from './session-engine'
import type { BlockSpec } from './types'

const beginner: BlockSpec = { type: 'hold', holdSec: 3, relaxSec: 3, reps: 10, sets: 3, restBetweenSetsSec: 10 }
const tiny: BlockSpec = { type: 'hold', holdSec: 5, relaxSec: 5, reps: 2, sets: 2, restBetweenSetsSec: 10 }
const T0 = 1_700_000_000_000

describe('buildTimeline', () => {
  it('alternates squeeze/relax and rests only between sets', () => {
    const kinds = buildTimeline([tiny]).map((s) => s.kind)
    expect(kinds).toEqual(['squeeze', 'relax', 'squeeze', 'relax', 'rest', 'squeeze', 'relax', 'squeeze', 'relax'])
  })

  it('rests between blocks but not after the last one', () => {
    const flick: BlockSpec = { type: 'flick', holdSec: 1, relaxSec: 1, reps: 1, sets: 1, restBetweenSetsSec: 5 }
    const kinds = buildTimeline([flick, flick]).map((s) => s.kind)
    expect(kinds).toEqual(['squeeze', 'relax', 'rest', 'squeeze', 'relax'])
  })

  it('computes total duration', () => {
    // 3 sets × 10 reps × 6 s + 2 rests × 10 s
    expect(totalDurationMs([beginner])).toBe(200_000)
  })

  it('ignores empty blocks', () => {
    expect(buildTimeline([{ ...tiny, reps: 0 }])).toEqual([])
  })
})

describe('SessionEngine', () => {
  it('starts idle and runs to done on time', () => {
    const e = new SessionEngine([tiny])
    expect(e.snapshot(T0).phase).toBe('idle')
    expect(e.start(T0)).toEqual([{ type: 'phase', segmentIndex: 0, phase: 'squeeze', atActiveMs: 0 }])
    expect(e.snapshot(T0 + 4_999).phase).toBe('squeeze')
    expect(e.tick(T0 + 5_000).map((x) => x.phase)).toEqual(['relax'])
    const total = e.totalDurationMs
    expect(total).toBe(50_000)
    e.tick(T0 + total - 1)
    expect(e.status).toBe('running')
    const last = e.tick(T0 + total)
    expect(last.at(-1)?.phase).toBe('done')
    expect(e.status).toBe('done')
    expect(e.endedEarly).toBe(false)
    expect(e.repsCompleted).toEqual([4])
    expect(e.snapshot(T0 + total + 60_000).activeElapsedMs).toBe(total)
  })

  it('reports rep, set and remaining time', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    e.tick(T0 + 12_000) // 2nd rep, squeeze, 2 s in
    const s = e.snapshot(T0 + 12_000)
    expect(s).toMatchObject({ phase: 'squeeze', set: 1, rep: 2, totalReps: 2, totalSets: 2 })
    expect(s.phaseRemainingMs).toBe(3_000)
    expect(s.phaseProgress).toBeCloseTo(0.4)
    expect(s.totalRemainingMs).toBe(38_000)
  })

  it('pause freezes time and resume continues where it left off', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    e.pause(T0 + 2_000)
    expect(e.status).toBe('paused')
    // 10 minutes later nothing has moved.
    expect(e.tick(T0 + 600_000)).toEqual([])
    expect(e.snapshot(T0 + 600_000).phaseRemainingMs).toBe(3_000)
    e.resume(T0 + 600_000)
    expect(e.snapshot(T0 + 602_999).phase).toBe('squeeze')
    expect(e.tick(T0 + 603_000).map((x) => x.phase)).toEqual(['relax'])
  })

  it('handles repeated pause/resume without drift', () => {
    const e = new SessionEngine([beginner])
    e.start(T0)
    let now = T0
    let paused = 0
    for (let i = 0; i < 20; i++) {
      now += 7_013
      e.pause(now)
      now += 1_337
      paused += 1_337
      e.resume(now)
    }
    e.tick(now)
    expect(e.snapshot(now).activeElapsedMs).toBe(now - T0 - paused)
    e.tick(T0 + paused + e.totalDurationMs)
    expect(e.status).toBe('done')
  })

  it('skip jumps to the next phase and the rest of the session shifts with it', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    const ev = e.skip(T0 + 1_000)
    expect(ev.map((x) => x.phase)).toEqual(['relax'])
    // Skipped squeeze does not count as a completed rep.
    expect(e.repsCompleted).toEqual([0])
    expect(e.snapshot(T0 + 1_000).phaseRemainingMs).toBe(5_000)
    expect(e.tick(T0 + 6_000).map((x) => x.phase)).toEqual(['squeeze'])
  })

  it('skip can jump over a rest and works while paused', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    e.tick(T0 + 20_000)
    expect(e.snapshot(T0 + 20_000).phase).toBe('rest')
    e.pause(T0 + 21_000)
    e.skip(T0 + 25_000)
    expect(e.status).toBe('paused')
    const s = e.snapshot(T0 + 25_000)
    expect(s).toMatchObject({ phase: 'squeeze', set: 2, rep: 1 })
    expect(s.phaseRemainingMs).toBe(5_000)
  })

  it('skip on the final phase finishes the session', () => {
    const e = new SessionEngine([{ ...tiny, sets: 1, reps: 1 }])
    e.start(T0)
    e.skip(T0 + 100)
    const ev = e.skip(T0 + 200)
    expect(ev.at(-1)?.phase).toBe('done')
    expect(e.status).toBe('done')
    expect(e.endedEarly).toBe(false)
  })

  it('catches up after the tab was backgrounded across several phases', () => {
    const e = new SessionEngine([beginner])
    e.start(T0)
    e.tick(T0 + 1_000)
    // No ticks for 30 s while backgrounded.
    const ev = e.tick(T0 + 31_000)
    expect(ev.length).toBe(10)
    const s = e.snapshot(T0 + 31_000)
    expect(s).toMatchObject({ phase: 'squeeze', rep: 6 })
    expect(s.phaseRemainingMs).toBe(2_000)
    expect(e.repsCompleted).toEqual([5])
  })

  it('stays within ±0.5 s over a full session with a 30 s background gap and jittery ticks', () => {
    const e = new SessionEngine([beginner])
    e.start(T0)
    let now = T0
    while (now < T0 + 60_000) {
      now += 90 + Math.round(Math.random() * 40)
      e.tick(now)
    }
    now += 30_000 // backgrounded
    e.tick(now)
    while (e.status !== 'done') {
      now += 90 + Math.round(Math.random() * 40)
      e.tick(now)
    }
    // Finished at the right moment (bounded only by tick resolution).
    expect(now - T0 - e.totalDurationMs).toBeLessThan(500)
    expect(e.snapshot(now).activeElapsedMs).toBe(e.totalDurationMs)
    expect(e.repsCompleted).toEqual([30])
  })

  it('ending early marks the session incomplete and keeps progress', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    e.tick(T0 + 13_000)
    const ev = e.end(T0 + 13_000)
    expect(ev.at(-1)?.phase).toBe('done')
    expect(e.status).toBe('done')
    expect(e.endedEarly).toBe(true)
    expect(e.repsCompleted).toEqual([1])
    expect(e.snapshot(T0 + 99_000).activeElapsedMs).toBe(13_000)
    // Further calls are no-ops.
    expect(e.tick(T0 + 99_000)).toEqual([])
    expect(e.skip(T0 + 99_000)).toEqual([])
  })

  it('ending while paused uses paused time', () => {
    const e = new SessionEngine([tiny])
    e.start(T0)
    e.pause(T0 + 3_000)
    e.end(T0 + 50_000)
    expect(e.snapshot(T0 + 50_000).activeElapsedMs).toBe(3_000)
  })

  it('counts reps per block', () => {
    const flicks: BlockSpec = { type: 'flick', holdSec: 1, relaxSec: 1, reps: 5, sets: 1, restBetweenSetsSec: 0 }
    const e = new SessionEngine([{ ...tiny, sets: 1 }, flicks])
    e.start(T0)
    // 20 s holds + 10 s rest between blocks + 10 s flicks
    e.tick(T0 + 40_000)
    expect(e.status).toBe('done')
    expect(e.repsCompleted).toEqual([2, 5])
  })

  it('an empty session is done immediately', () => {
    const e = new SessionEngine([])
    expect(e.start(T0).at(-1)?.phase).toBe('done')
    expect(e.status).toBe('done')
  })

  it('ignores invalid transitions', () => {
    const e = new SessionEngine([tiny])
    expect(e.pause(T0)).toEqual([])
    e.resume(T0)
    expect(e.status).toBe('idle')
    expect(e.end(T0)).toEqual([])
    e.start(T0)
    expect(e.start(T0 + 1)).toEqual([])
    e.resume(T0 + 1)
    expect(e.status).toBe('running')
  })
})
