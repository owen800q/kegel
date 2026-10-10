import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as db from '@/db'
import { defaultSettings } from '@/db/defaults'
import type { Settings } from '@/types'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>(defaultSettings())
  const loaded = ref(false)

  async function load() {
    settings.value = await db.loadSettings()
    loaded.value = true
  }

  async function update(patch: Partial<Settings>) {
    settings.value = { ...settings.value, ...patch }
    await db.saveSettings(settings.value)
  }

  function replace(next: Settings) {
    settings.value = next
  }

  return { settings, loaded, load, update, replace }
})
