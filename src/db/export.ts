import type { BlockType } from '@/engine/types'
import type { CustomRoutine, Session, Settings } from '@/types'
import { defaultSettings } from './defaults'
import { DB_VERSION } from './migrations'

export const EXPORT_APP_ID = 'core-timer'

export interface ExportPayload {
  app: typeof EXPORT_APP_ID
  schemaVersion: number
  exportedAt: string
  sessions: Session[]
  routines: CustomRoutine[]
  settings: Settings
}

export function buildExport(
  data: Pick<ExportPayload, 'sessions' | 'routines' | 'settings'>,
  now = new Date(),
): ExportPayload {
  return {
    app: EXPORT_APP_ID,
    schemaVersion: DB_VERSION,
    exportedAt: now.toISOString(),
    sessions: data.sessions,
    routines: data.routines,
    settings: data.settings,
  }
}

/**
 * Upgrades for export files, keyed by the version they upgrade *to*.
 * Mirror every DB migration that changes record shapes here.
 */
export const exportMigrations: Record<number, (payload: Record<string, unknown>) => Record<string, unknown>> = {}

export class ImportError extends Error {
  constructor(public readonly code: 'notJson' | 'notOurs' | 'tooNew' | 'invalid') {
    super(code)
  }
}

const BLOCK_TYPES: readonly BlockType[] = ['hold', 'flick', 'relax']

/** Parse, migrate and validate an export file. Throws `ImportError`. */
export function parseImport(text: string): ExportPayload {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('notJson')
  }
  if (!isObject(raw) || raw.app !== EXPORT_APP_ID || typeof raw.schemaVersion !== 'number') {
    throw new ImportError('notOurs')
  }
  if (raw.schemaVersion > DB_VERSION) throw new ImportError('tooNew')

  let payload: Record<string, unknown> = raw
  for (let v = (raw.schemaVersion as number) + 1; v <= DB_VERSION; v++) {
    const step = exportMigrations[v]
    if (step) payload = step(payload)
  }

  const { sessions, routines, settings } = payload
  if (!Array.isArray(sessions) || !sessions.every(isSession)) throw new ImportError('invalid')
  if (!Array.isArray(routines) || !routines.every(isRoutine)) throw new ImportError('invalid')
  if (!isObject(settings)) throw new ImportError('invalid')

  return {
    app: EXPORT_APP_ID,
    schemaVersion: DB_VERSION,
    exportedAt: typeof payload.exportedAt === 'string' ? payload.exportedAt : '',
    sessions,
    routines,
    settings: { ...defaultSettings(), ...(settings as Partial<Settings>) },
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isBlock(v: unknown): boolean {
  return (
    isObject(v) &&
    BLOCK_TYPES.includes(v.type as BlockType) &&
    isNum(v.holdSec) &&
    isNum(v.relaxSec) &&
    isNum(v.reps) &&
    isNum(v.sets) &&
    isNum(v.restBetweenSetsSec)
  )
}

function isSession(v: unknown): v is Session {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    isNum(v.startedAt) &&
    isNum(v.endedAt) &&
    typeof v.programId === 'string' &&
    typeof v.completed === 'boolean' &&
    Array.isArray(v.blocks) &&
    v.blocks.every((b) => isBlock(b) && isNum((b as Record<string, unknown>).repsCompleted))
  )
}

function isRoutine(v: unknown): v is CustomRoutine {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.favourite === 'boolean' &&
    Array.isArray(v.blocks) &&
    v.blocks.every(isBlock)
  )
}
