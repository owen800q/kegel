// Minimal Cloudflare Workers types for what this Worker uses (avoids an extra
// @cloudflare/workers-types dependency).

interface D1Result<T = Record<string, unknown>> {
  results: T[]
  success: boolean
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<D1Result>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  first<T = Record<string, unknown>>(): Promise<T | null>
}

interface D1Database {
  prepare(query: string): D1PreparedStatement
  exec(query: string): Promise<unknown>
}

interface Fetcher {
  fetch(request: Request): Promise<Response>
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
}

interface ScheduledController {
  scheduledTime: number
  cron: string
}

interface Env {
  ASSETS: Fetcher
  DB: D1Database
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  /** Local testing only: allow http://localhost push endpoints. */
  PUSH_ALLOW_LOCALHOST?: string
}
