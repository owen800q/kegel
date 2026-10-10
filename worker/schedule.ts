/** Reminder scheduling, independent of storage and transport. */

/** How long after a reminder time it may still be sent (covers a missed cron tick). */
export const SEND_WINDOW_MIN = 15

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function isValidHm(hm: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(hm)
}

/** Local calendar day ("YYYY-MM-DD") and minutes since midnight in `timeZone`. */
export function localClock(now: number, timeZone: string): { day: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  )
  return { day: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/**
 * Which reminder times are due now. A time is due from its minute until
 * SEND_WINDOW_MIN later, once per local day (`lastSent` maps time → day).
 */
export function dueTimes(
  times: readonly string[],
  timeZone: string,
  lastSent: Readonly<Record<string, string>>,
  now: number,
): string[] {
  const { day, minutes } = localClock(now, timeZone)
  return times.filter((t) => {
    if (!isValidHm(t) || lastSent[t] === day) return false
    const at = Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
    return minutes >= at && minutes < at + SEND_WINDOW_MIN
  })
}
