import { openDB, type IDBPDatabase } from 'idb'
import type { CustomRoutine, Session, Settings } from '@/types'
import { defaultSettings } from './defaults'
import type { ExportPayload } from './export'
import { DB_VERSION, runMigrations } from './migrations'
import { DB_NAME, SETTINGS_KEY, type CoreTimerDB } from './schema'

let dbPromise: Promise<IDBPDatabase<CoreTimerDB>> | null = null

export function getDb(): Promise<IDBPDatabase<CoreTimerDB>> {
  dbPromise ??= openDB<CoreTimerDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      runMigrations(db, tx, oldVersion, newVersion ?? DB_VERSION)
    },
    blocking() {
      // A newer tab wants to upgrade: step aside so it can.
      void dbPromise?.then((db) => db.close())
      dbPromise = null
    },
  })
  return dbPromise
}

export async function loadSettings(): Promise<Settings> {
  const db = await getDb()
  const stored = await db.get('settings', SETTINGS_KEY)
  return { ...defaultSettings(), ...stored }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDb()
  await db.put('settings', structuredClone(settings), SETTINGS_KEY)
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDb()
  return db.getAllFromIndex('sessions', 'startedAt')
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDb()
  await db.put('sessions', structuredClone(session))
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('sessions', id)
}

export async function listRoutines(): Promise<CustomRoutine[]> {
  const db = await getDb()
  return db.getAll('routines')
}

export async function putRoutine(routine: CustomRoutine): Promise<void> {
  const db = await getDb()
  await db.put('routines', structuredClone(routine))
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('routines', id)
}

export async function readAll(): Promise<Omit<ExportPayload, 'schemaVersion' | 'app' | 'exportedAt'>> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'routines', 'settings'])
  const [sessions, routines, settings] = await Promise.all([
    tx.objectStore('sessions').index('startedAt').getAll(),
    tx.objectStore('routines').getAll(),
    tx.objectStore('settings').get(SETTINGS_KEY),
    tx.done,
  ])
  return { sessions, routines, settings: { ...defaultSettings(), ...settings } }
}

/** Replace everything in one transaction, so a failed import changes nothing. */
export async function replaceAll(data: Pick<ExportPayload, 'sessions' | 'routines' | 'settings'>): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'routines', 'settings'], 'readwrite')
  const sessions = tx.objectStore('sessions')
  const routines = tx.objectStore('routines')
  const settings = tx.objectStore('settings')
  await Promise.all([sessions.clear(), routines.clear(), settings.clear()])
  await Promise.all([
    ...data.sessions.map((s) => sessions.put(s)),
    ...data.routines.map((r) => routines.put(r)),
    settings.put(data.settings, SETTINGS_KEY),
  ])
  await tx.done
}

export async function clearAll(): Promise<void> {
  const db = await getDb()
  const tx = db.transaction(['sessions', 'routines', 'settings'], 'readwrite')
  await Promise.all([
    tx.objectStore('sessions').clear(),
    tx.objectStore('routines').clear(),
    tx.objectStore('settings').clear(),
    tx.done,
  ])
}
