<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import HeatCalendar from '@/components/HeatCalendar.vue'
import LineChart from '@/components/LineChart.vue'
import { addDays, startOfMonth, startOfWeek } from '@/lib/date'
import { countsByDay, dailyTrend, streaks, totals } from '@/lib/stats'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'

const { t, locale } = useI18n()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()

const now = Date.now()
const month = ref(startOfMonth(now))
const weekStart = ref(startOfWeek(now))

const streak = computed(() => streaks(sessionStore.sessions, Date.now()))
const total = computed(() => totals(sessionStore.sessions))
const counts = computed(() => countsByDay(sessionStore.sessions))

// Charts show the last 30 training days.
const trend = computed(() => dailyTrend(sessionStore.sessions).slice(-30))
const shortDate = computed(() => new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric' }))
const holdPoints = computed(() =>
  trend.value.map((p) => ({ label: shortDate.value.format(new Date(`${p.day}T12:00:00`)), value: p.longestHold })),
)
const ratingPoints = computed(() =>
  trend.value.map((p) => ({ label: shortDate.value.format(new Date(`${p.day}T12:00:00`)), value: p.avgRating })),
)
const latest = (pts: { value: number | null }[]) => {
  const v = [...pts].reverse().find((p) => p.value !== null)?.value
  return v === undefined || v === null ? '–' : Number.isInteger(v) ? String(v) : v.toFixed(1)
}
const hasHold = computed(() => holdPoints.value.some((p) => p.value !== null))
const hasRating = computed(() => ratingPoints.value.some((p) => p.value !== null))

// History, one week at a time.
const weekSessions = computed(() => {
  const from = weekStart.value.getTime()
  const to = addDays(weekStart.value, 7).getTime()
  return sessionStore.sessions.filter((s) => s.startedAt >= from && s.startedAt < to).sort((a, b) => b.startedAt - a.startedAt)
})
const weekLabel = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { month: 'short', day: 'numeric' })
  return t('progress.weekRange', { from: fmt.format(weekStart.value), to: fmt.format(addDays(weekStart.value, 6)) })
})
const canNextWeek = computed(() => addDays(weekStart.value, 7).getTime() <= Date.now())
const timeFmt = computed(() => new Intl.DateTimeFormat(locale.value, { weekday: 'short', hour: '2-digit', minute: '2-digit' }))

function programName(id: string) {
  return id === 'custom' ? t('programs.custom') : t(`programs.${id}.name`)
}
function minutes(ms: number) {
  return Math.max(1, Math.round(ms / 60_000))
}
</script>

<template>
  <div class="page">
    <h1 class="page__title">{{ t('progress.title') }}</h1>

    <div class="stat-grid">
      <section class="card stat">
        <h2 class="stat__label">{{ t('progress.streakCurrent') }}</h2>
        <p class="stat__value">{{ t('today.streakDays', { n: streak.current }) }}</p>
      </section>
      <section class="card stat">
        <h2 class="stat__label">{{ t('progress.streakLongest') }}</h2>
        <p class="stat__value">{{ t('today.streakDays', { n: streak.longest }) }}</p>
      </section>
      <section class="card stat">
        <h2 class="stat__label">{{ t('progress.totalSessions') }}</h2>
        <p class="stat__value">{{ total.sessions }}</p>
      </section>
      <section class="card stat">
        <h2 class="stat__label">{{ t('progress.totalMinutes') }}</h2>
        <p class="stat__value">{{ total.minutes }}</p>
      </section>
    </div>

    <section class="card" aria-labelledby="cal-title">
      <h2 id="cal-title" class="card__title">{{ t('progress.calendar') }}</h2>
      <HeatCalendar v-model:month="month" :counts="counts" :target="settingsStore.settings.dailyTarget" />
    </section>

    <section class="card">
      <template v-if="hasHold || hasRating">
        <LineChart v-if="hasHold" :title="t('progress.chartHold')" :points="holdPoints" :min="0" :summary="latest(holdPoints)" />
        <LineChart v-if="hasRating" :title="t('progress.chartRating')" :points="ratingPoints" :min="1" :max="5" :summary="latest(ratingPoints)" />
      </template>
      <p v-else class="muted">{{ t('progress.noChartData') }}</p>
    </section>

    <h2 class="weui-cells__title">{{ t('progress.history') }}</h2>
    <div class="week-nav">
      <button type="button" class="btn-reset heat__arrow" :aria-label="t('progress.prevWeek')" @click="weekStart = addDays(weekStart, -7)">‹</button>
      <span aria-live="polite">{{ weekLabel }}</span>
      <button type="button" class="btn-reset heat__arrow" :aria-label="t('progress.nextWeek')" :disabled="!canNextWeek" @click="weekStart = addDays(weekStart, 7)">›</button>
    </div>
    <div class="weui-cells">
      <RouterLink
        v-for="s in weekSessions"
        :key="s.id"
        :to="{ name: 'session-detail', params: { id: s.id } }"
        class="weui-cell weui-cell_access"
      >
        <div class="weui-cell__bd">
          <p class="cell-title">
            {{ programName(s.programId) }}
            <span v-if="!s.completed" class="tag tag_muted">{{ t('progress.incomplete') }}</span>
          </p>
          <p class="weui-cell__desc">
            {{ timeFmt.format(s.startedAt) }} · {{ t('common.minutes', { n: minutes(s.endedAt - s.startedAt) }) }}
            <template v-if="s.rating"> · {{ t('progress.rating') }} {{ s.rating }}/5</template>
          </p>
        </div>
        <div class="weui-cell__ft"></div>
      </RouterLink>
      <div v-if="weekSessions.length === 0" class="weui-cell">
        <div class="weui-cell__bd muted">{{ t('progress.noSessions') }}</div>
      </div>
    </div>
  </div>
</template>
