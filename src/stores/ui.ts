import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface DialogButton {
  label: string
  value: string
  kind?: 'primary' | 'default' | 'warn'
}

export interface DialogState {
  title?: string
  body: string
  buttons: DialogButton[]
  resolve: (value: string | null) => void
}

export interface ActionsheetState {
  title?: string
  actions: { label: string; value: string; warn?: boolean }[]
  cancelLabel: string
  resolve: (value: string | null) => void
}

/** Promise-based WeUI dialog, toast and actionsheet, rendered by `UiHost`. */
export const useUiStore = defineStore('ui', () => {
  const dialog = ref<DialogState | null>(null)
  const actionsheet = ref<ActionsheetState | null>(null)
  const toast = ref<{ text: string; icon: 'success' | 'warn' | 'none' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | undefined

  function showDialog(opts: Omit<DialogState, 'resolve'>): Promise<string | null> {
    dialog.value?.resolve(null)
    return new Promise((resolve) => {
      dialog.value = { ...opts, resolve }
    })
  }

  function closeDialog(value: string | null) {
    const d = dialog.value
    dialog.value = null
    d?.resolve(value)
  }

  async function confirm(opts: { title?: string; body: string; ok: string; cancel: string; warn?: boolean }) {
    const result = await showDialog({
      title: opts.title,
      body: opts.body,
      buttons: [
        { label: opts.cancel, value: 'cancel', kind: 'default' },
        { label: opts.ok, value: 'ok', kind: opts.warn ? 'warn' : 'primary' },
      ],
    })
    return result === 'ok'
  }

  function showActionsheet(opts: Omit<ActionsheetState, 'resolve'>): Promise<string | null> {
    actionsheet.value?.resolve(null)
    return new Promise((resolve) => {
      actionsheet.value = { ...opts, resolve }
    })
  }

  function closeActionsheet(value: string | null) {
    const a = actionsheet.value
    actionsheet.value = null
    a?.resolve(value)
  }

  function showToast(text: string, icon: 'success' | 'warn' | 'none' = 'success', ms = 1800) {
    clearTimeout(toastTimer)
    toast.value = { text, icon }
    toastTimer = setTimeout(() => (toast.value = null), ms)
  }

  return { dialog, actionsheet, toast, showDialog, closeDialog, confirm, showActionsheet, closeActionsheet, showToast }
})
