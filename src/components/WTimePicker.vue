<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import PickerColumn from './PickerColumn.vue'
import { parseHm } from '@/lib/date'

const props = defineProps<{ value: string; title: string }>()
const emit = defineEmits<{ confirm: [value: string]; cancel: [] }>()
const { t } = useI18n()

const initial = Number.isNaN(parseHm(props.value)) ? 8 * 60 : parseHm(props.value)
const hour = ref(Math.floor(initial / 60))
const minute = ref(initial % 60)

const pad = (n: number) => String(n).padStart(2, '0')
const hours = Array.from({ length: 24 }, (_, i) => ({ label: pad(i), value: i }))
const minutes = Array.from({ length: 60 }, (_, i) => ({ label: pad(i), value: i }))

function confirm() {
  emit('confirm', `${pad(hour.value)}:${pad(minute.value)}`)
}
</script>

<template>
  <!-- Rendered on <body> so the tab bar and scroll container can't cover or clip it. -->
  <Teleport to="body">
    <div class="picker-layer" @keydown.esc="emit('cancel')">
      <div class="weui-mask" @click="emit('cancel')"></div>
      <div class="weui-picker picker-open" role="dialog" aria-modal="true" :aria-label="title">
        <div class="weui-picker__hd picker-hd">
          <button type="button" class="weui-picker__action btn-reset picker-action" @click="emit('cancel')">
            {{ t('common.cancel') }}
          </button>
          <strong class="picker-title">{{ title }}</strong>
          <button type="button" class="weui-picker__action btn-reset picker-action picker-action_primary" @click="confirm">
            {{ t('common.ok') }}
          </button>
        </div>
        <div class="weui-picker__bd">
          <PickerColumn v-model="hour" :options="hours" label="HH" />
          <PickerColumn v-model="minute" :options="minutes" label="mm" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
