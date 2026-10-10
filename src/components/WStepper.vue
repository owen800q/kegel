<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{ label: string; min?: number; max?: number; step?: number; format?: (v: number) => string }>(),
  { min: 0, max: 999, step: 1, format: undefined },
)
const model = defineModel<number>({ required: true })
const { t } = useI18n()

const display = computed(() => (props.format ? props.format(model.value) : String(model.value)))

function change(dir: 1 | -1) {
  const next = Math.round((model.value + dir * props.step) * 100) / 100
  model.value = Math.min(props.max, Math.max(props.min, next))
}
</script>

<template>
  <div class="weui-cell stepper-cell">
    <div class="weui-cell__bd">{{ label }}</div>
    <div class="weui-cell__ft stepper">
      <button
        type="button"
        class="stepper__btn btn-reset"
        :aria-label="t('common.decrease', { label })"
        :disabled="model <= min"
        @click="change(-1)"
      >
        −
      </button>
      <output class="stepper__value" aria-live="polite">{{ display }}</output>
      <button
        type="button"
        class="stepper__btn btn-reset"
        :aria-label="t('common.increase', { label })"
        :disabled="model >= max"
        @click="change(1)"
      >
        +
      </button>
    </div>
  </div>
</template>
