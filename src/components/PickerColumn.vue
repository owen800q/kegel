<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const ITEM_HEIGHT = 56

const props = defineProps<{ options: { label: string; value: number }[]; label: string }>()
const model = defineModel<number>({ required: true })
const scroller = ref<HTMLElement | null>(null)
let settleTimer: ReturnType<typeof setTimeout> | undefined

function indexOfValue(v: number) {
  return Math.max(0, props.options.findIndex((o) => o.value === v))
}

function scrollToIndex(i: number, smooth = false) {
  scroller.value?.scrollTo({ top: i * ITEM_HEIGHT, behavior: smooth ? 'smooth' : 'auto' })
}

function onScroll() {
  clearTimeout(settleTimer)
  settleTimer = setTimeout(() => {
    const el = scroller.value
    if (!el) return
    const i = Math.min(props.options.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT)))
    model.value = props.options[i].value
  }, 120)
}

function select(i: number) {
  model.value = props.options[i].value
  scrollToIndex(i, true)
}

function onKey(e: KeyboardEvent) {
  const i = indexOfValue(model.value)
  const delta = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 }[e.key]
  if (delta === undefined) return
  e.preventDefault()
  select(Math.min(props.options.length - 1, Math.max(0, i + delta)))
}

onMounted(() => scrollToIndex(indexOfValue(model.value)))
watch(model, (v) => {
  const el = scroller.value
  if (el && Math.round(el.scrollTop / ITEM_HEIGHT) !== indexOfValue(v)) scrollToIndex(indexOfValue(v), true)
})
</script>

<template>
  <div class="weui-picker__group">
    <div class="weui-picker__mask picker-mask" aria-hidden="true"></div>
    <div class="weui-picker__indicator" aria-hidden="true"></div>
    <div
      ref="scroller"
      class="picker-scroll"
      role="listbox"
      tabindex="0"
      :aria-label="label"
      :aria-activedescendant="`${label}-${model}`"
      @scroll.passive="onScroll"
      @keydown="onKey"
    >
      <div
        v-for="(o, i) in options"
        :id="`${label}-${o.value}`"
        :key="o.value"
        class="weui-picker__item"
        role="option"
        :aria-selected="o.value === model"
        @click="select(i)"
      >
        {{ o.label }}
      </div>
    </div>
  </div>
</template>
