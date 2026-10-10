<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { addDays, addMonths, dayKey, startOfMonth, startOfWeek } from '@/lib/date'

const props = defineProps<{ month: Date; counts: Map<string, number>; target: number }>()
const emit = defineEmits<{ 'update:month': [Date] }>()
const { t, locale } = useI18n()

const title = computed(() => new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'long' }).format(props.month))
const weekdays = computed(() => {
  const fmt = new Intl.DateTimeFormat(locale.value, { weekday: 'narrow' })
  const monday = startOfWeek(new Date(2026, 0, 7))
  return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(monday, i)))
})
const todayKey = dayKey(Date.now())
const canGoNext = computed(() => startOfMonth(Date.now()) > props.month)

const days = computed(() => {
  const first = startOfMonth(props.month)
  const gridStart = startOfWeek(first)
  const end = addMonths(first, 1)
  const fmt = new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric' })
  const cells = []
  for (let d = gridStart; d < end || cells.length % 7 !== 0; d = addDays(d, 1)) {
    const key = dayKey(d)
    const n = props.counts.get(key) ?? 0
    const inMonth = d.getMonth() === first.getMonth()
    // 0–4 intensity levels, relative to the daily target.
    const level = n === 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((n / Math.max(1, props.target)) * 4)))
    cells.push({ key, day: d.getDate(), n, inMonth, level, label: t('progress.dayCount', { date: fmt.format(d), n }) })
  }
  return cells
})
</script>

<template>
  <div class="heat">
    <div class="heat__nav">
      <button type="button" class="btn-reset heat__arrow" :aria-label="t('progress.prevMonth')" @click="emit('update:month', addMonths(month, -1))">‹</button>
      <h3 class="heat__title" aria-live="polite">{{ title }}</h3>
      <button type="button" class="btn-reset heat__arrow" :aria-label="t('progress.nextMonth')" :disabled="!canGoNext" @click="emit('update:month', addMonths(month, 1))">›</button>
    </div>
    <div class="heat__grid" role="grid" :aria-label="title">
      <div role="row" class="heat__row">
        <span v-for="(w, i) in weekdays" :key="i" role="columnheader" class="heat__wd">{{ w }}</span>
      </div>
      <div v-for="r in days.length / 7" :key="r" role="row" class="heat__row">
        <span
          v-for="c in days.slice((r - 1) * 7, r * 7)"
          :key="c.key"
          role="gridcell"
          class="heat__cell"
          :class="[`heat__cell_l${c.level}`, { heat__cell_out: !c.inMonth, heat__cell_today: c.key === todayKey }]"
          :aria-label="c.inMonth ? c.label : undefined"
          :aria-hidden="c.inMonth ? undefined : 'true'"
        >
          <span class="heat__day" aria-hidden="true">{{ c.inMonth ? c.day : '' }}</span>
          <span v-if="c.inMonth && c.n > 0" class="heat__n" aria-hidden="true">{{ c.n }}</span>
        </span>
      </div>
    </div>
    <div class="heat__legend" aria-hidden="true">
      <span>{{ t('progress.legendLess') }}</span>
      <span v-for="l in 5" :key="l" class="heat__cell heat__swatch" :class="`heat__cell_l${l - 1}`"></span>
      <span>{{ t('progress.legendMore') }}</span>
    </div>
  </div>
</template>
