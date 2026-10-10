import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getProgram, nextProgram, programs } from '@/data/programs'
import { shouldSuggestProgress, PROGRESS_MIN_SESSIONS } from '@/lib/stats'
import { storage } from '@/lib/storage'
import { useSessionStore } from './session'
import { useSettingsStore } from './settings'

const DISMISS_KEY = 'progressDismissed'

export const useProgramStore = defineStore('program', () => {
  const settingsStore = useSettingsStore()
  const sessionStore = useSessionStore()
  const dismissed = ref<Record<string, number>>(storage.getJson(DISMISS_KEY) ?? {})

  const current = computed(() => getProgram(settingsStore.settings.currentProgramId) ?? programs[0])
  const next = computed(() => nextProgram(current.value.id))

  const completedInCurrent = computed(
    () => sessionStore.sessions.filter((s) => s.completed && s.programId === current.value.id).length,
  )

  /** Suggest moving up; once dismissed, wait for another 5 sessions before asking again. */
  const suggestion = computed(() => {
    if (!next.value) return null
    const dismissedAt = dismissed.value[current.value.id]
    if (dismissedAt !== undefined && completedInCurrent.value < dismissedAt + PROGRESS_MIN_SESSIONS) return null
    if (!shouldSuggestProgress(sessionStore.sessions, current.value.id)) return null
    return { from: current.value, to: next.value, count: completedInCurrent.value }
  })

  async function setCurrent(id: string) {
    await settingsStore.update({ currentProgramId: id })
  }

  function dismissSuggestion() {
    dismissed.value = { ...dismissed.value, [current.value.id]: completedInCurrent.value }
    storage.setJson(DISMISS_KEY, dismissed.value)
  }

  return { current, next, suggestion, setCurrent, dismissSuggestion }
})
