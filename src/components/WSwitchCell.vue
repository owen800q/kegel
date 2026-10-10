<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string; disabled?: boolean; hint?: string }>()
const model = defineModel<boolean>({ required: true })
const id = useId()

// Show the real value until the parent confirms the change, so a toggle that
// fails (or is async, like enabling push) never leaves the switch out of sync.
function onChange(e: Event) {
  const el = e.target as HTMLInputElement
  const wanted = el.checked
  el.checked = model.value
  model.value = wanted
}
</script>

<template>
  <div class="weui-cell weui-cell_active weui-cell_switch">
    <div class="weui-cell__bd">
      <label :for="id">{{ label }}</label>
      <div v-if="hint" class="weui-cell__desc">{{ hint }}</div>
    </div>
    <div class="weui-cell__ft">
      <input :id="id" :checked="model" class="weui-switch" type="checkbox" role="switch" :disabled="disabled" @change="onChange" />
    </div>
  </div>
</template>
