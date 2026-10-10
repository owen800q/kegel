import type { Session } from '@/types'
import { addDays, dayKey, parseHm, startOfDay, startOfWeek } from './date'

/** Sessions that count towards streaks, targets and totals. */
export function countable(sessions: readonly Session[]): Session[] {
  return sessions.filter((s) => s.completed)
}

export function countsByDay(sessions: readonly Session[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of countable(sessions)) {
    const k = dayKey(s.startedAt)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

export function streaks(sessions: readonly Session[], now: number): { current: number; longest: number } {
  const days = countsByDay(sessions)
  if (days.size === 0) return { current: 0, longest: 0 }

  // Current: consecutive days ending today, or yesterday if today has none yet.
  let cursor = startOfDay(now)
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  let current = 0
  while (days.has(dayKey(cursor))) {
    current++
    cursor = addDays(cursor, -1)
  }

  const sorted = [...days.keys()].sort()
  let longest = 0
  let run = 0
  let prev: string | null = null
  for (const k of sorted) {
    run = prev !== null && dayKey(addDays(new Date(`${prev}T12:00:00`), 1)) === k ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = k
  }
  return { current, longest }
}

export function countOnDay(sessions: readonly Session[], now: number): number {
  return countsByDay(sessions).get(dayKey(now)) ?? 0
}

export function countInWeek(sessions: readonly Session[], now: number): number {
  const from = startOfWeek(now).getTime()
  const to = addDays(from, 7).getTime()
  return countable(sessions).filter((s) => s.startedAt >= from && s.startedAt < to).length
}

export function totals(sessions: readonly Session[]): { sessions: number; minutes: number } {
  const done = countable(sessions)
  const ms = done.reduce((sum, s) => sum + Math.max(0, s.endedAt - s.startedAt), 0)
  return { sessions: done.length, minutes: Math.round(ms / 60_000) }
}

/** Longest hold actually performed in a session (hold blocks with at least one rep). */
export function longestHold(session: Session): number {
  return session.blocks
    .filter((b) => b.type === 'hold' && b.repsCompleted > 0)
    .reduce((max, b) => Math.max(max, b.holdSec), 0)
}

export interface DayPoint {
  day: string
  longestHold: number | null
  avgRating: number | null
}

/** One point per day with any countable session, oldest first. */
export function dailyTrend(sessions: readonly Session[]): DayPoint[] {
  const byDay = new Map<string, Session[]>()
  for (const s of countable(sessions)) {
    const k = dayKey(s.startedAt)
    byDay.set(k, [...(byDay.get(k) ?? []), s])
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, list]) => {
      const hold = Math.max(...list.map(longestHold))
      const rated = list.filter((s) => s.rating)
      return {
        day,
        longestHold: hold > 0 ? hold : null,
        avgRating: rated.length ? rated.reduce((sum, s) => sum + (s.rating ?? 0), 0) / rated.length : null,
      }
    })
}

export const PROGRESS_MIN_SESSIONS = 5
export const PROGRESS_MIN_RATING = 4

/**
 * Whether to suggest moving up from `programId`: at least 5 completed
 * sessions in it, and an average self-rating ≥ 4 over the last 5 (each must
 * be rated, so we never advance on missing data).
 */
export function shouldSuggestProgress(sessions: readonly Session[], programId: string): boolean {
  const inProgram = countable(sessions)
    .filter((s) => s.programId === programId)
    .sort((a, b) => a.startedAt - b.startedAt)
  if (inProgram.length < PROGRESS_MIN_SESSIONS) return false
  const recent = inProgram.slice(-PROGRESS_MIN_SESSIONS)
  if (!recent.every((s) => s.rating)) return false
  const avg = recent.reduce((sum, s) => sum + (s.rating ?? 0), 0) / recent.length
  return avg >= PROGRESS_MIN_RATING
}

/**
 * Reminder nudge: the latest reminder time that has passed today, if fewer
 * sessions have been done today than reminders that have passed.
 */
export function dueReminder(reminderTimes: readonly string[], doneToday: number, now: number): string | null {
  const date = new Date(now)
  const minutes = date.getHours() * 60 + date.getMinutes()
  const passed = reminderTimes
    .filter((t) => parseHm(t) <= minutes)
    .sort((a, b) => parseHm(a) - parseHm(b))
  return passed.length > doneToday ? passed[passed.length - 1] : null
}
