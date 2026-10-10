import { parseHm } from './date'

export interface IcsOptions {
  times: readonly string[]
  title: string
  description?: string
  durationMin?: number
  /** First occurrence date (local); defaults to today. */
  from?: Date
  /** Used for DTSTAMP and UID; injectable for tests. */
  now?: Date
}

/**
 * A calendar with one daily-recurring event per reminder time. Times are
 * "floating" (no time zone), so they stay at the same local clock time.
 */
export function buildIcs({ times, title, description, durationMin = 5, from, now = new Date() }: IcsOptions): string {
  const day = from ?? now
  const ymd = `${day.getFullYear()}${pad(day.getMonth() + 1)}${pad(day.getDate())}`
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Core Timer//Reminders//EN', 'CALSCALE:GREGORIAN']
  const valid = [...new Set(times)].filter((t) => !Number.isNaN(parseHm(t))).sort()
  for (const t of valid) {
    const mins = parseHm(t)
    const hhmm = `${pad(Math.floor(mins / 60))}${pad(mins % 60)}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ymd}-${hhmm}-${stamp}@core-timer`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${ymd}T${hhmm}00`,
      `DURATION:PT${durationMin}M`,
      'RRULE:FREQ=DAILY',
      `SUMMARY:${escapeText(title)}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeText(title)}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const parts: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length
    const limit = parts.length === 0 ? 75 : 74
    if (size + len > limit) {
      parts.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += len
  }
  parts.push(current)
  return parts.join('\r\n ')
}
