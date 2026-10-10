/** localStorage for small per-device UI flags. Every access may throw (private mode, blocked storage). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* ignore */
    }
  },
  getJson<T>(key: string): T | null {
    try {
      const v = this.get(key)
      return v ? (JSON.parse(v) as T) : null
    } catch {
      return null
    }
  },
  setJson(key: string, value: unknown) {
    this.set(key, JSON.stringify(value))
  },
  clear() {
    try {
      localStorage.clear()
    } catch {
      /* ignore */
    }
  },
}
