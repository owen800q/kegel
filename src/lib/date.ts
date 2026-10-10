/** Local-time calendar day key, e.g. "2026-10-10". */
export function dayKey(d: Date | number): string {
  const date = typeof d === 'number' ? new Date(d) : d
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function startOfDay(d: Date | number): Date {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  return date
}

export function addDays(d: Date | number, n: number): Date {
  const date = new Date(d)
  date.setDate(date.getDate() + n)
  return date
}

/** Weeks start on Monday. */
export function startOfWeek(d: Date | number): Date {
  const date = startOfDay(d)
  const offset = (date.getDay() + 6) % 7
  return addDays(date, -offset)
}

export function startOfMonth(d: Date | number): Date {
  const date = startOfDay(d)
  date.setDate(1)
  return date
}

export function addMonths(d: Date | number, n: number): Date {
  const date = startOfMonth(d)
  date.setMonth(date.getMonth() + n)
  return date
}

/** "HH:mm" → minutes since midnight, or NaN. */
export function parseHm(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return NaN
  const h = Number(m[1])
  const min = Number(m[2])
  return h < 24 && min < 60 ? h * 60 + min : NaN
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
