import { describe, expect, it } from 'vitest'
import type { Session } from '@/types'
import { formatClock, parseHm, startOfWeek } from './date'
import { buildIcs } from './ics'
import { hashPin, newSalt, verifyPin } from './pin'
import {
  countInWeek,
  countOnDay,
  dailyTrend,
  dueReminder,
  longestHold,
  shouldSuggestProgress,
  streaks,
  totals,
} from './stats'

function at(ymd: string, hm = '09:00'): number {
  return new Date(`${ymd}T${hm}:00`).getTime()
}

function s(ymd: string, extra: Partial<Session> = {}): Session {
  const startedAt = at(ymd)
  return {
    id: `${ymd}-${Math.random()}`,
    startedAt,
    endedAt: startedAt + 180_000,
    programId: 'beginner',
    completed: true,
    blocks: [{ type: 'hold', holdSec: 3, relaxSec: 3, reps: 10, sets: 3, restBetweenSetsSec: 10, repsCompleted: 30 }],
    ...extra,
  }
}

describe('date helpers', () => {
  it('parses HH:mm', () => {
    expect(parseHm('08:30')).toBe(510)
    expect(Number.isNaN(parseHm('25:00'))).toBe(true)
    expect(Number.isNaN(parseHm('nope'))).toBe(true)
  })
  it('formats a countdown, rounding up', () => {
    expect(formatClock(61_001)).toBe('1:02')
    expect(formatClock(0)).toBe('0:00')
  })
  it('weeks start on Monday', () => {
    expect(startOfWeek(at('2026-10-11')).getDate()).toBe(5) // Sunday → Monday 5th
    expect(startOfWeek(at('2026-10-05')).getDate()).toBe(5)
  })
})

describe('stats', () => {
  const now = at('2026-10-10', '20:00')

  it('computes current and longest streak', () => {
    const list = [
      s('2026-10-01'),
      s('2026-10-02'),
      s('2026-10-03'),
      s('2026-10-04'),
      s('2026-10-08'),
      s('2026-10-09'),
      s('2026-10-09'),
      s('2026-10-10', { completed: false }),
    ]
    // Today only has an incomplete session, so the streak runs to yesterday.
    expect(streaks(list, now)).toEqual({ current: 2, longest: 4 })
    expect(streaks([...list, s('2026-10-10')], now)).toEqual({ current: 3, longest: 4 })
    expect(streaks([s('2026-10-07')], now)).toEqual({ current: 0, longest: 1 })
    expect(streaks([], now)).toEqual({ current: 0, longest: 0 })
  })

  it('counts today and this week, ignoring incomplete sessions', () => {
    const list = [s('2026-10-04'), s('2026-10-05'), s('2026-10-10'), s('2026-10-10', { completed: false })]
    expect(countOnDay(list, now)).toBe(1)
    expect(countInWeek(list, now)).toBe(2)
  })

  it('totals sessions and minutes', () => {
    expect(totals([s('2026-10-01'), s('2026-10-02'), s('2026-10-03', { completed: false })])).toEqual({
      sessions: 2,
      minutes: 6,
    })
  })

  it('longest hold ignores flicks and unperformed blocks', () => {
    const session = s('2026-10-01', {
      blocks: [
        { type: 'hold', holdSec: 5, relaxSec: 5, reps: 10, sets: 1, restBetweenSetsSec: 0, repsCompleted: 3 },
        { type: 'hold', holdSec: 10, relaxSec: 10, reps: 10, sets: 1, restBetweenSetsSec: 0, repsCompleted: 0 },
        { type: 'flick', holdSec: 1, relaxSec: 1, reps: 10, sets: 1, restBetweenSetsSec: 0, repsCompleted: 10 },
      ],
    })
    expect(longestHold(session)).toBe(5)
  })

  it('builds a daily trend', () => {
    const trend = dailyTrend([s('2026-10-02', { rating: 3 }), s('2026-10-01'), s('2026-10-02', { rating: 5 })])
    expect(trend).toEqual([
      { day: '2026-10-01', longestHold: 3, avgRating: null },
      { day: '2026-10-02', longestHold: 3, avgRating: 4 },
    ])
  })

  it('suggests progress after 5 well-rated sessions only', () => {
    const good = Array.from({ length: 5 }, (_, i) => s(`2026-10-0${i + 1}`, { rating: 4 }))
    expect(shouldSuggestProgress(good.slice(0, 4), 'beginner')).toBe(false)
    expect(shouldSuggestProgress(good, 'beginner')).toBe(true)
    expect(shouldSuggestProgress(good, 'advanced')).toBe(false)
    expect(shouldSuggestProgress([...good.slice(0, 4), s('2026-10-06', { rating: 2 })], 'beginner')).toBe(false)
    expect(shouldSuggestProgress([...good.slice(0, 4), s('2026-10-06')], 'beginner')).toBe(false)
  })

  it('nudges when a reminder time passed without a session', () => {
    const times = ['08:00', '13:00', '21:00']
    expect(dueReminder(times, 0, at('2026-10-10', '07:59'))).toBeNull()
    expect(dueReminder(times, 0, at('2026-10-10', '08:00'))).toBe('08:00')
    expect(dueReminder(times, 1, at('2026-10-10', '12:00'))).toBeNull()
    expect(dueReminder(times, 1, at('2026-10-10', '13:05'))).toBe('13:00')
  })
})

describe('ics', () => {
  const ics = buildIcs({
    times: ['21:00', '08:00', '08:00'],
    title: 'Core 5 min',
    now: new Date('2026-10-10T06:00:00Z'),
    from: new Date(2026, 9, 10),
  })

  it('has one daily event per unique time', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2)
    expect(ics).toContain('DTSTART:20261010T080000')
    expect(ics).toContain('DTSTART:20261010T210000')
    expect(ics).toContain('RRULE:FREQ=DAILY')
    expect(ics).toContain('SUMMARY:Core 5 min')
  })

  it('uses CRLF and wraps the calendar', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('escapes and folds long text', () => {
    const long = buildIcs({ times: ['08:00'], title: 'a,b;c', description: '長'.repeat(40) })
    expect(long).toContain('SUMMARY:a\\,b\\;c')
    for (const line of long.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
  })
})

describe('pin', () => {
  it('verifies the right PIN only', async () => {
    const salt = newSalt()
    const hash = await hashPin('1234', salt)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifyPin('1234', salt, hash)).toBe(true)
    expect(await verifyPin('4321', salt, hash)).toBe(false)
    expect(await hashPin('1234', newSalt())).not.toBe(hash)
  })
})
