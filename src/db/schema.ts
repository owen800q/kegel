import type { DBSchema } from 'idb'
import type { CustomRoutine, Session, Settings } from '@/types'

export const DB_NAME = 'core-timer'
export const SETTINGS_KEY = 'settings'

export interface CoreTimerDB extends DBSchema {
  sessions: { key: string; value: Session; indexes: { startedAt: number } }
  routines: { key: string; value: CustomRoutine }
  settings: { key: string; value: Settings }
}
