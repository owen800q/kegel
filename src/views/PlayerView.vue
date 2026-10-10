<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import SessionRing from '@/components/SessionRing.vue'
import { getProgram } from '@/data/programs'
import { SessionEngine, type PhaseChange, type Snapshot } from '@/engine/session-engine'
import type { BlockSpec, BlockType, PhaseKind } from '@/engine/types'
import { createWakeLock, playCue, unlockAudio, type CueKind } from '@/lib/cues'
import { formatClock } from '@/lib/date'
import { uuid } from '@/lib/platform'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useUiStore } from '@/stores/ui'
import type { Level, Rating, Session } from '@/types'

const TICK_MS = 100
/** Don't play cues for phases that started more than this long ago (e.g. while backgrounded). */
const STALE_CUE_MS = 1000

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const sessionStore = useSessionStore()
const ui = useUiStore()

// Resolve what to play from the query: ?program=<id> or ?routine=<id>.
const source = (() => {
  const programId = typeof route.query.program === 'string' ? route.query.program : undefined
  const routineId = typeof route.query.routine === 'string' ? route.query.routine : undefined
  if (routineId) {
    const r = sessionStore.routines.find((x) => x.id === routineId)
    return r ? { name: r.name, programId: 'custom' as const, level: undefined, blocks: r.blocks } : null
  }
  const p = getProgram(programId ?? settingsStore.settings.currentProgramId)
  return p ? { name: t(`programs.${p.id}.name`), programId: p.id, level: p.level as Level, blocks: p.blocks } : null
})()

const engine = new SessionEngine((source?.blocks ?? []) as BlockSpec[])
const snap = shallowRef<Snapshot>(engine.snapshot(Date.now()))
const wakeLock = createWakeLock()
let timer: ReturnType<typeof setInterval> | undefined
let startedAt = 0
let sessionId = ''
let leaving = false

// Saved session (written as soon as the engine finishes).
const saved = ref<Session | null>(null)
const rating = ref<Rating | undefined>()
const note = ref('')

const running = computed(() => snap.value.status === 'running' || snap.value.status === 'paused')
const paused = computed(() => snap.value.status === 'paused')
const blockType = computed<BlockType | null>(() => snap.value.blockType)

function phaseLabel(phase: PhaseKind, type: BlockType | null): string {
  if (type === 'relax' && phase === 'squeeze') return t('phase.inhale')
  if (type === 'relax' && phase === 'relax') return t('phase.exhale')
  return t(`phase.${phase}`)
}

const label = computed(() => phaseLabel(snap.value.phase, blockType.value))
const announce = computed(() => (paused.value ? t('phase.paused') : label.value))
const countdown = computed(() =>
  snap.value.phase === 'idle' ? formatClock(snap.value.totalDurationMs) : String(Math.ceil(snap.value.phaseRemainingMs / 1000)),
)

function cueFor(e: PhaseChange): CueKind | null {
  const seg = engine.segments[e.segmentIndex]
  if (e.phase === 'done') return 'done'
  if (!seg) return null
  if (seg.kind === 'rest') return 'rest'
  if (seg.blockType === 'relax') return seg.kind === 'squeeze' ? 'inhale' : 'exhale'
  return seg.kind
}

function handle(events: PhaseChange[], now: number) {
  const last = events.at(-1)
  if (last) {
    const active = engine.snapshot(now).activeElapsedMs
    const cue = cueFor(last)
    if (cue && (cue === 'done' || active - last.atActiveMs <= STALE_CUE_MS)) {
      const { vibration, audio } = settingsStore.settings
      const word = cue === 'rest' || cue === 'done' ? undefined : t(`voice.${cue}`)
      playCue(cue, { vibration, audio, lang: locale.value, word })
    }
  }
  snap.value = engine.snapshot(now)
  if (engine.status === 'done' && !saved.value) void finish()
}

function tick() {
  const now = Date.now()
  handle(engine.tick(now), now)
}

function start() {
  if (!source) return
  unlockAudio()
  void wakeLock.request()
  startedAt = Date.now()
  sessionId = uuid()
  timer = setInterval(tick, TICK_MS)
  document.addEventListener('visibilitychange', tick)
  handle(engine.start(startedAt), startedAt)
}


function togglePause() {
  const now = Date.now()
  if (engine.status === 'running') handle(engine.pause(now), now)
  else if (engine.status === 'paused') {
    engine.resume(now)
    snap.value = engine.snapshot(now)
  }
}

function skip() {
  const now = Date.now()
  handle(engine.skip(now), now)
}

async function confirmEnd(): Promise<boolean> {
  return ui.confirm({
    title: t('player.endConfirmTitle'),
    body: t('player.endConfirm'),
    ok: t('player.endOk'),
    cancel: t('common.cancel'),
    warn: true,
  })
}

async function end() {
  if (!(await confirmEnd())) return
  const now = Date.now()
  handle(engine.end(now), now)
}

function stopTimers() {
  clearInterval(timer)
  timer = undefined
  document.removeEventListener('visibilitychange', tick)
  void wakeLock.release()
}

async function finish() {
  stopTimers()
  const session: Session = {
    id: sessionId,
    startedAt,
    endedAt: Date.now(),
    programId: source!.programId,
    ...(source!.level ? { level: source!.level } : {}),
    blocks: engine.blocks.map((b, i) => ({ ...b, repsCompleted: engine.repsCompleted[i] ?? 0 })),
    completed: !engine.endedEarly,
  }
  saved.value = session
  await sessionStore.saveSession(session)
}

const summary = computed(() => {
  const s = saved.value
  if (!s) return null
  const reps = s.blocks.reduce((sum, b) => sum + b.repsCompleted, 0)
  const totalReps = s.blocks.reduce((sum, b) => sum + b.reps * b.sets, 0)
  const sets = s.blocks.reduce((sum, b) => sum + Math.floor(b.repsCompleted / Math.max(1, b.reps)), 0)
  const totalSets = s.blocks.reduce((sum, b) => sum + b.sets, 0)
  return { duration: formatClock(snap.value.activeElapsedMs), reps, totalReps, sets, totalSets }
})

async function done() {
  if (saved.value && (rating.value || note.value.trim())) {
    await sessionStore.saveSession({
      ...saved.value,
      ...(rating.value ? { rating: rating.value } : {}),
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    })
  }
  leaving = true
  void router.replace({ name: 'today' })
}

onBeforeRouteLeave(async () => {
  if (leaving || !running.value) return true
  if (!(await confirmEnd())) return false
  const now = Date.now()
  handle(engine.end(now), now)
  return true
})

onBeforeUnmount(stopTimers)
</script>

<template>
  <div class="player" :class="[`player_${snap.phase}`, { player_summary: summary }]">
    <template v-if="!source">
      <div class="weui-msg">
        <div class="weui-msg__text-area">
          <h1 class="weui-msg__title">{{ t('player.notFound') }}</h1>
        </div>
        <div class="weui-msg__opr-area">
          <RouterLink to="/" class="weui-btn weui-btn_primary">{{ t('common.back') }}</RouterLink>
        </div>
      </div>
    </template>

    <!-- Summary -->
    <template v-else-if="summary">
      <div class="weui-msg player-summary">
        <div class="weui-msg__icon-area">
          <i class="weui-icon_msg" :class="saved?.completed ? 'weui-icon-success' : 'weui-icon-info'" aria-hidden="true"></i>
        </div>
        <div class="weui-msg__text-area">
          <h1 class="weui-msg__title">{{ saved?.completed ? t('player.summaryTitle') : t('player.summaryEarly') }}</h1>
          <p class="weui-msg__desc">{{ source.name }}</p>
        </div>
        <dl class="summary-stats">
          <div><dt>{{ t('player.duration') }}</dt><dd>{{ summary.duration }}</dd></div>
          <div><dt>{{ t('player.reps') }}</dt><dd>{{ summary.reps }} / {{ summary.totalReps }}</dd></div>
          <div><dt>{{ t('player.sets') }}</dt><dd>{{ summary.sets }} / {{ summary.totalSets }}</dd></div>
        </dl>
        <fieldset class="rating">
          <legend class="rating__legend">{{ t('player.ratingLabel') }}</legend>
          <div class="rating__options">
            <label v-for="n in 5" :key="n" class="rating__option" :class="{ rating__option_on: rating === n }">
              <input v-model="rating" type="radio" name="rating" :value="n" class="visually-hidden" />
              <span aria-hidden="true">{{ n }}</span>
              <span class="visually-hidden">{{ t('player.rating', { n }) }}</span>
            </label>
          </div>
          <div class="rating__scale" aria-hidden="true">
            <span>{{ t('player.ratingLow') }}</span><span>{{ t('player.ratingHigh') }}</span>
          </div>
        </fieldset>
        <div class="weui-cells weui-cells_form note-cells">
          <div class="weui-cell">
            <div class="weui-cell__bd">
              <label for="session-note" class="note-label">{{ t('player.note') }}</label>
              <textarea id="session-note" v-model="note" class="weui-textarea" rows="2" maxlength="200" :placeholder="t('player.notePlaceholder')"></textarea>
            </div>
          </div>
        </div>
        <div class="weui-msg__opr-area">
          <button type="button" class="weui-btn weui-btn_primary big-btn" @click="done">{{ t('player.finish') }}</button>
        </div>
      </div>
    </template>

    <!-- Player -->
    <template v-else>
      <header class="player__top">
        <p class="player__name">{{ source.name }}</p>
        <p v-if="running && blockType" class="player__block">{{ t(`blockType.${blockType}`) }}</p>
      </header>

      <div class="player__ring">
        <SessionRing
          :phase="snap.phase"
          :block-type="blockType"
          :paused="paused"
          :progress="snap.phaseProgress"
          :phase-duration-ms="snap.phaseDurationMs"
          :label="label"
          :countdown="countdown"
        />
        <p class="visually-hidden" aria-live="assertive" aria-atomic="true">{{ running ? announce : '' }}</p>
      </div>

      <div v-if="running" class="player__meta">
        <span v-if="snap.phase !== 'rest'">{{ t('player.repOf', { rep: snap.rep, total: snap.totalReps }) }}</span>
        <span v-else>{{ t('player.restNext') }}</span>
        <span>{{ t('player.setOf', { set: snap.set, total: snap.totalSets }) }}</span>
        <span>{{ t('player.remaining', { time: formatClock(snap.totalRemainingMs) }) }}</span>
      </div>
      <p v-else class="player__hint">{{ t('player.ready') }}</p>
      <p class="player__tip">{{ t('player.breatheHint') }}</p>

      <div class="player__controls">
        <template v-if="running">
          <button type="button" class="weui-btn weui-btn_default ctl" @click="end">{{ t('player.end') }}</button>
          <button type="button" class="weui-btn weui-btn_primary ctl ctl_main" @click="togglePause">
            {{ paused ? t('player.resume') : t('player.pause') }}
          </button>
          <button type="button" class="weui-btn weui-btn_default ctl" @click="skip">{{ t('player.skip') }}</button>
        </template>
        <template v-else>
          <RouterLink to="/" class="weui-btn weui-btn_default ctl">{{ t('common.back') }}</RouterLink>
          <button type="button" class="weui-btn weui-btn_primary ctl ctl_main" @click="start">{{ t('common.start') }}</button>
        </template>
      </div>
    </template>
  </div>
</template>
