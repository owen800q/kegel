<script setup lang="ts">
import { computed } from 'vue'

/** Minimal dependency-free SVG line chart. Points with a null value are skipped. */
const props = defineProps<{
  title: string
  points: { label: string; value: number | null }[]
  min?: number
  max?: number
  /** Accessible summary, e.g. latest value. */
  summary: string
}>()

const W = 320
const H = 140
const PAD = { l: 28, r: 8, t: 10, b: 22 }

const valid = computed(() => props.points.map((p, i) => ({ ...p, i })).filter((p) => p.value !== null) as { label: string; value: number; i: number }[])
const yMin = computed(() => props.min ?? Math.min(...valid.value.map((p) => p.value)))
const yMax = computed(() => {
  const m = props.max ?? Math.max(...valid.value.map((p) => p.value))
  return m === yMin.value ? m + 1 : m
})

function x(i: number) {
  const n = props.points.length
  return n <= 1 ? (PAD.l + W - PAD.r) / 2 : PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
}
function y(v: number) {
  return PAD.t + (1 - (v - yMin.value) / (yMax.value - yMin.value)) * (H - PAD.t - PAD.b)
}

const path = computed(() => valid.value.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' '))
const ticks = computed(() => {
  const lo = yMin.value
  const hi = yMax.value
  return [lo, (lo + hi) / 2, hi].map((v) => ({ v, y: y(v), label: Number.isInteger(v) ? String(v) : v.toFixed(1) }))
})
const xLabels = computed(() => {
  const pts = props.points
  if (pts.length === 0) return []
  const idx = pts.length === 1 ? [0] : [0, pts.length - 1]
  return idx.map((i) => ({ x: x(i), label: pts[i].label, anchor: i === 0 ? 'start' : 'end' }))
})
</script>

<template>
  <figure class="chart">
    <figcaption class="chart__title">{{ title }}</figcaption>
    <svg :viewBox="`0 0 ${W} ${H}`" class="chart__svg" role="img" :aria-label="`${title}: ${summary}`">
      <g class="chart__grid">
        <line v-for="tk in ticks" :key="tk.v" :x1="PAD.l" :x2="W - PAD.r" :y1="tk.y" :y2="tk.y" />
      </g>
      <g class="chart__axis">
        <text v-for="tk in ticks" :key="`t${tk.v}`" :x="PAD.l - 6" :y="tk.y + 4" text-anchor="end">{{ tk.label }}</text>
        <text v-for="xl in xLabels" :key="xl.label + xl.anchor" :x="xl.x" :y="H - 4" :text-anchor="xl.anchor">{{ xl.label }}</text>
      </g>
      <path class="chart__line" :d="path" />
      <circle v-for="p in valid" :key="p.i" class="chart__dot" :cx="x(p.i)" :cy="y(p.value)" r="3" />
    </svg>
  </figure>
</template>
