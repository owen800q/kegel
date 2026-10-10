<script setup lang="ts">
import { computed } from 'vue'
import type { BlockType, PhaseKind } from '@/engine/types'

const props = defineProps<{
  phase: PhaseKind
  blockType: BlockType | null
  paused: boolean
  /** 0 → 1 through the current phase. */
  progress: number
  phaseDurationMs: number
  label: string
  countdown: string
}>()

const R = 46
const CIRC = 2 * Math.PI * R

// Breathing blocks grow on the in-breath and shrink on the out-breath over
// the whole phase; squeeze/relax snap quickly then hold.
const breathing = computed(() => props.blockType === 'relax')
const scale = computed(() => {
  switch (props.phase) {
    case 'squeeze':
      return breathing.value ? 1 : 0.62
    case 'relax':
      return breathing.value ? 0.7 : 1
    case 'rest':
      return 0.85
    default:
      return 0.85
  }
})
const transitionMs = computed(() => {
  if (props.phase !== 'squeeze' && props.phase !== 'relax') return 400
  return breathing.value ? props.phaseDurationMs : Math.min(600, props.phaseDurationMs)
})
const dashOffset = computed(() => CIRC * (1 - Math.min(1, Math.max(0, props.progress))))
</script>

<template>
  <div class="ring" :class="[`ring_${phase}`, { ring_paused: paused, ring_breathing: breathing }]">
    <svg class="ring__svg" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring__track" cx="50" cy="50" :r="R" />
      <circle
        class="ring__progress"
        cx="50"
        cy="50"
        :r="R"
        :stroke-dasharray="CIRC"
        :stroke-dashoffset="dashOffset"
        transform="rotate(-90 50 50)"
      />
    </svg>
    <div
      class="ring__core"
      :style="{ transform: `scale(${scale})`, transitionDuration: `${transitionMs}ms` }"
      aria-hidden="true"
    ></div>
    <div class="ring__text">
      <div class="ring__label">{{ label }}</div>
      <div class="ring__count">{{ countdown }}</div>
    </div>
  </div>
</template>
