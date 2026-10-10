<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const dialogEl = ref<HTMLElement | null>(null)
const sheetEl = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

// Move focus into a modal while it is open and restore it afterwards.
watch(
  () => [ui.dialog, ui.actionsheet],
  async ([d, a]) => {
    if (d || a) {
      returnFocus ??= document.activeElement as HTMLElement | null
      await nextTick()
      const root = d ? dialogEl.value : sheetEl.value
      root?.querySelector<HTMLElement>('button')?.focus()
    } else {
      returnFocus?.focus?.()
      returnFocus = null
    }
  },
)

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (ui.dialog) ui.closeDialog(null)
  else if (ui.actionsheet) ui.closeActionsheet(null)
}
</script>

<template>
  <div @keydown="onKey">
    <div v-if="ui.dialog">
      <div class="weui-mask" @click="ui.closeDialog(null)"></div>
      <div
        ref="dialogEl"
        class="weui-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="ui.dialog.title ? 'ui-dialog-title' : undefined"
        aria-describedby="ui-dialog-body"
      >
        <div v-if="ui.dialog.title" class="weui-dialog__hd">
          <strong id="ui-dialog-title" class="weui-dialog__title">{{ ui.dialog.title }}</strong>
        </div>
        <div id="ui-dialog-body" class="weui-dialog__bd">{{ ui.dialog.body }}</div>
        <div class="weui-dialog__ft">
          <button
            v-for="b in ui.dialog.buttons"
            :key="b.value"
            type="button"
            class="weui-dialog__btn btn-reset"
            :class="`weui-dialog__btn_${b.kind ?? 'primary'}`"
            @click="ui.closeDialog(b.value)"
          >
            {{ b.label }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="ui.actionsheet">
      <div class="weui-mask" @click="ui.closeActionsheet(null)"></div>
      <div ref="sheetEl" class="weui-actionsheet weui-actionsheet_toggle" role="dialog" aria-modal="true" :aria-label="ui.actionsheet.title">
        <div v-if="ui.actionsheet.title" class="weui-actionsheet__title">
          <p class="weui-actionsheet__title-text">{{ ui.actionsheet.title }}</p>
        </div>
        <div class="weui-actionsheet__menu">
          <button
            v-for="a in ui.actionsheet.actions"
            :key="a.value"
            type="button"
            class="weui-actionsheet__cell btn-reset"
            :class="{ 'weui-actionsheet__cell_warn': a.warn }"
            @click="ui.closeActionsheet(a.value)"
          >
            {{ a.label }}
          </button>
        </div>
        <div class="weui-actionsheet__action">
          <button type="button" class="weui-actionsheet__cell btn-reset" @click="ui.closeActionsheet(null)">
            {{ ui.actionsheet.cancelLabel }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="ui.toast" role="status" aria-live="polite">
      <div class="weui-mask_transparent"></div>
      <div class="weui-toast" :class="{ 'weui-toast_text': ui.toast.icon === 'none' }">
        <i v-if="ui.toast.icon === 'success'" class="weui-icon-success-no-circle weui-icon_toast" aria-hidden="true"></i>
        <i v-else-if="ui.toast.icon === 'warn'" class="weui-icon-warn weui-icon_toast" aria-hidden="true"></i>
        <p class="weui-toast__content">{{ ui.toast.text }}</p>
      </div>
    </div>
  </div>
</template>
