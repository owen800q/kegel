import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb'
import type { CoreTimerDB } from './schema'

type UpgradeTx = IDBPTransaction<CoreTimerDB, StoreNames<CoreTimerDB>[], 'versionchange'>

/**
 * IndexedDB schema migrations, keyed by the version they upgrade *to*.
 * Never edit a released migration; add a new version instead and bump
 * `DB_VERSION`. Each step may also need a matching entry in
 * `exportMigrations` (export.ts) so old backups still import.
 */
export const dbMigrations: Record<number, (db: IDBPDatabase<CoreTimerDB>, tx: UpgradeTx) => void> = {
  1: (db) => {
    const sessions = db.createObjectStore('sessions', { keyPath: 'id' })
    sessions.createIndex('startedAt', 'startedAt')
    db.createObjectStore('routines', { keyPath: 'id' })
    db.createObjectStore('settings')
  },
}

export const DB_VERSION = Math.max(...Object.keys(dbMigrations).map(Number))

/** Run every migration between `oldVersion` (exclusive) and `newVersion` (inclusive). */
export function runMigrations(db: IDBPDatabase<CoreTimerDB>, tx: UpgradeTx, oldVersion: number, newVersion: number) {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const step = dbMigrations[v]
    if (!step) throw new Error(`Missing DB migration to version ${v}`)
    step(db, tx)
  }
}
