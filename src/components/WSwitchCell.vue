<script setup lang="ts">
import { useId } from 'vue'

defineProps<{ label: string; disabled?: boolean; hint?: string }>()
const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <div class="weui-cell weui-cell_active weui-cell_switch">
    <div class="weui-cell__bd">
      <label :for="id">{{ label }}</label>
      <div v-if="hint" class="weui-cell__desc">{{ hint }}</div>
    </div>
    <div class="weui-cell__ft">
      <input :id="id" v-model="model" class="weui-switch" type="checkbox" role="switch" :disabled="disabled" />
    </div>
  </div>
</template>
