<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{ title: string; error?: string }>()
const emit = defineEmits<{ complete: [pin: string]; cancel: [] }>()
const { t } = useI18n()
const pin = ref('')

function press(d: string) {
  if (pin.value.length >= 4) return
  pin.value += d
  if (pin.value.length === 4) {
    const value = pin.value
    // Let the 4th dot render before handing off.
    setTimeout(() => {
      pin.value = ''
      emit('complete', value)
    }, 120)
  }
}

function back() {
  pin.value = pin.value.slice(0, -1)
}

function onKey(e: KeyboardEvent) {
  if (/^\d$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') back()
}

defineExpose({ reset: () => (pin.value = '') })
</script>

<template>
  <div class="pinpad" tabindex="-1" @keydown="onKey">
    <h2 class="pinpad__title">{{ title }}</h2>
    <div class="pinpad__dots" role="img" :aria-label="`${pin.length} / 4`">
      <span v-for="i in 4" :key="i" class="pinpad__dot" :class="{ pinpad__dot_on: i <= pin.length }"></span>
    </div>
    <p class="pinpad__error" role="alert">{{ error }}</p>
    <div class="pinpad__keys">
      <button
        v-for="d in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
        :key="d"
        type="button"
        class="btn-reset pinpad__key"
        :aria-label="t('pin.digit', { n: d })"
        @click="press(d)"
      >
        {{ d }}
      </button>
      <slot name="extra"><span></span></slot>
      <button type="button" class="btn-reset pinpad__key" :aria-label="t('pin.digit', { n: '0' })" @click="press('0')">0</button>
      <button type="button" class="btn-reset pinpad__key pinpad__key_fn" :aria-label="t('pin.backspace')" @click="back">⌫</button>
    </div>
  </div>
</template>
