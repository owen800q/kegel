import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as db from '@/db'
import { buildExport, type ExportPayload } from '@/db/export'
import { defaultSettings } from '@/db/defaults'
import type { CustomRoutine, Session } from '@/types'
import { useSettingsStore } from './settings'

/** Training history and custom routines, mirrored from IndexedDB. */
export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Session[]>([])
  const routines = ref<CustomRoutine[]>([])

  const sortedRoutines = computed(() =>
    [...routines.value].sort((a, b) => Number(b.favourite) - Number(a.favourite) || a.name.localeCompare(b.name)),
  )

  async function load() {
    const [s, r] = await Promise.all([db.listSessions(), db.listRoutines()])
    sessions.value = s
    routines.value = r
  }

  async function saveSession(session: Session) {
    await db.putSession(session)
    const i = sessions.value.findIndex((s) => s.id === session.id)
    if (i >= 0) sessions.value.splice(i, 1, session)
    else sessions.value = [...sessions.value, session].sort((a, b) => a.startedAt - b.startedAt)
  }

  async function removeSession(id: string) {
    await db.deleteSession(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
  }

  async function saveRoutine(routine: CustomRoutine) {
    await db.putRoutine(routine)
    const i = routines.value.findIndex((r) => r.id === routine.id)
    if (i >= 0) routines.value.splice(i, 1, routine)
    else routines.value.push(routine)
  }

  async function removeRoutine(id: string) {
    await db.deleteRoutine(id)
    routines.value = routines.value.filter((r) => r.id !== id)
  }

  async function exportAll(): Promise<ExportPayload> {
    return buildExport(await db.readAll())
  }

  async function importAll(payload: ExportPayload) {
    await db.replaceAll(payload)
    await load()
    await useSettingsStore().load()
  }

  async function deleteAll() {
    await db.clearAll()
    sessions.value = []
    routines.value = []
    useSettingsStore().replace(defaultSettings())
  }

  return {
    sessions,
    routines,
    sortedRoutines,
    load,
    saveSession,
    removeSession,
    saveRoutine,
    removeRoutine,
    exportAll,
    importAll,
    deleteAll,
  }
})
