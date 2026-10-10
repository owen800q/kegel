import { describe, expect, it } from 'vitest'
import { buildExport, ImportError, parseImport } from './export'
import { defaultSettings } from './defaults'
import type { Session } from '@/types'

const session: Session = {
  id: 'a',
  startedAt: 1,
  endedAt: 2,
  programId: 'beginner',
  level: 'beginner',
  completed: true,
  rating: 4,
  note: 'ok',
  blocks: [{ type: 'hold', holdSec: 3, relaxSec: 3, reps: 10, sets: 3, restBetweenSetsSec: 10, repsCompleted: 30 }],
}

describe('export/import', () => {
  it('round-trips identical data', () => {
    const data = {
      sessions: [session],
      routines: [{ id: 'r', name: 'Mine', favourite: true, blocks: [session.blocks[0]] }],
      settings: { ...defaultSettings(), pinHash: 'h', pinSalt: 's', onboardingDone: true },
    }
    const exported = buildExport(data, new Date('2026-01-01T00:00:00Z'))
    expect(exported.schemaVersion).toBe(1)
    const parsed = parseImport(JSON.stringify(exported))
    expect(parsed).toEqual(exported)
  })

  it('fills in settings added after the backup was made', () => {
    const exported = buildExport({ sessions: [], routines: [], settings: defaultSettings() })
    const { dailyTarget: _omit, ...partial } = exported.settings
    const parsed = parseImport(JSON.stringify({ ...exported, settings: partial }))
    expect(parsed.settings.dailyTarget).toBe(3)
  })

  it.each([
    ['not json', 'notJson'],
    ['{"foo":1}', 'notOurs'],
    ['{"app":"core-timer","schemaVersion":99}', 'tooNew'],
    ['{"app":"core-timer","schemaVersion":1,"sessions":[{"id":1}],"routines":[],"settings":{}}', 'invalid'],
    ['{"app":"core-timer","schemaVersion":1,"sessions":[],"routines":[],"settings":null}', 'invalid'],
  ])('rejects %s', (text, code) => {
    expect(() => parseImport(text)).toThrowError(new ImportError(code as ImportError['code']))
  })
})
