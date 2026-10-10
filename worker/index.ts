/**
 * Core Timer Worker: serves the static app and a tiny Web Push reminder API.
 *
 * Privacy: the database holds only push subscriptions, reminder times and
 * the time zone needed to interpret them. Never training data.
 */
import { dueTimes, isValidHm, isValidTimeZone, localClock } from './schedule'
import { b64urlDecode, sendPush, type PushSubscriptionKeys, type VapidKeys } from './webpush'

const MAX_TIMES = 10
const MAX_BODY = 4096

/** Hosts of the browser push services we deliver to (prevents using the Worker as an open proxy). */
// Chrome/Chromium endpoints vary (fcm.googleapis.com, jmt17.google.com, …).
const PUSH_HOSTS = ['updates.push.services.mozilla.com']
const PUSH_HOST_SUFFIXES = ['.googleapis.com', '.google.com', '.push.apple.com', '.notify.windows.com']

const SCHEMA = `CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  times TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  last_sent TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`

interface Row {
  endpoint: string
  p256dh: string
  auth: string
  times: string
  time_zone: string
  last_sent: string
}

let schemaReady: Promise<unknown> | null = null
function ensureSchema(db: D1Database) {
  // The D1 database is auto-provisioned on deploy, so the Worker creates its own table.
  schemaReady ??= db.prepare(SCHEMA).run().catch((err) => {
    schemaReady = null
    throw err
  })
  return schemaReady
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    },
  })
}

function vapidFrom(env: Env): VapidKeys | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT || 'mailto:admin@example.com',
  }
}

export function isAllowedEndpoint(endpoint: unknown, allowLocalhost = false): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (allowLocalhost && url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true
  if (url.protocol !== 'https:') return false
  return PUSH_HOSTS.includes(url.hostname) || PUSH_HOST_SUFFIXES.some((s) => url.hostname.endsWith(s))
}

function decodedLength(s: unknown): number {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+=*$/.test(s)) return -1
  try {
    return b64urlDecode(s.replace(/=+$/, '')).length
  } catch {
    return -1
  }
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  if (!req.headers.get('Content-Type')?.includes('application/json')) return null
  const text = await req.text()
  if (text.length > MAX_BODY) return null
  try {
    const v = JSON.parse(text)
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? v : null
  } catch {
    return null
  }
}

async function handleApi(req: Request, env: Env, url: URL): Promise<Response> {
  const vapid = vapidFrom(env)
  const allowLocal = env.PUSH_ALLOW_LOCALHOST === '1'

  if (url.pathname === '/api/push/config' && req.method === 'GET') {
    return json({ enabled: Boolean(vapid), publicKey: vapid?.publicKey ?? null })
  }
  if (!vapid) return json({ error: 'push-not-configured' }, 503)

  if (url.pathname === '/api/push/subscribe' && req.method === 'POST') {
    const body = await readJson(req)
    const sub = body?.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | undefined
    const times = body?.times
    const timeZone = body?.timeZone
    if (
      !sub ||
      !isAllowedEndpoint(sub.endpoint, allowLocal) ||
      decodedLength(sub.keys?.p256dh) !== 65 ||
      decodedLength(sub.keys?.auth) !== 16 ||
      !Array.isArray(times) ||
      times.length > MAX_TIMES ||
      !times.every((t) => typeof t === 'string' && isValidHm(t)) ||
      typeof timeZone !== 'string' ||
      !isValidTimeZone(timeZone)
    ) {
      return json({ error: 'invalid' }, 400)
    }
    await ensureSchema(env.DB)
    const now = Date.now()
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth, times, time_zone, last_sent, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, '{}', ?6, ?6)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, times = ?4, time_zone = ?5, updated_at = ?6`,
    )
      .bind(sub.endpoint, sub.keys!.p256dh, sub.keys!.auth, JSON.stringify([...new Set(times as string[])].sort()), timeZone, now)
      .run()
    return json({ ok: true })
  }

  if (url.pathname === '/api/push/subscribe' && req.method === 'DELETE') {
    const body = await readJson(req)
    if (typeof body?.endpoint !== 'string') return json({ error: 'invalid' }, 400)
    await ensureSchema(env.DB)
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).run()
    return json({ ok: true })
  }

  if (url.pathname === '/api/push/test' && req.method === 'POST') {
    const body = await readJson(req)
    if (typeof body?.endpoint !== 'string') return json({ error: 'invalid' }, 400)
    await ensureSchema(env.DB)
    // Only registered subscriptions can be tested, so this can't push to arbitrary endpoints.
    const row = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?1').bind(body.endpoint).first<Row>()
    if (!row) return json({ error: 'not-found' }, 404)
    const result = await sendPush(toKeys(row), { type: 'test' }, vapid)
    if (result.expired) await deleteRow(env.DB, row.endpoint)
    return json({ ok: result.status < 300, status: result.status }, result.status < 300 ? 200 : 502)
  }

  return json({ error: 'not-found' }, 404)
}

function toKeys(row: Row): PushSubscriptionKeys {
  return { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth }
}

function deleteRow(db: D1Database, endpoint: string) {
  return db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1').bind(endpoint).run()
}

/** Send every reminder that is due. Exported for tests. */
export async function sendDueReminders(env: Env, now: number, fetcher?: typeof fetch): Promise<number> {
  const vapid = vapidFrom(env)
  if (!vapid) return 0
  await ensureSchema(env.DB)
  const { results } = await env.DB.prepare('SELECT * FROM push_subscriptions').all<Row>()
  let sent = 0
  const jobs = results.map(async (row) => {
    let times: string[]
    let lastSent: Record<string, string>
    try {
      times = JSON.parse(row.times)
      lastSent = JSON.parse(row.last_sent)
    } catch {
      return
    }
    const due = dueTimes(times, row.time_zone, lastSent, now)
    if (due.length === 0) return
    try {
      const result = await sendPush(toKeys(row), { type: 'reminder', time: due[due.length - 1] }, vapid, { fetcher })
      if (result.expired) {
        await deleteRow(env.DB, row.endpoint)
        return
      }
      if (result.status >= 300) return // retried on the next tick while still in the window
      sent++
      const { day } = localClock(now, row.time_zone)
      for (const t of due) lastSent[t] = day
      // Keep only entries for current times.
      const pruned = Object.fromEntries(Object.entries(lastSent).filter(([t]) => times.includes(t)))
      await env.DB.prepare('UPDATE push_subscriptions SET last_sent = ?1 WHERE endpoint = ?2')
        .bind(JSON.stringify(pruned), row.endpoint)
        .run()
    } catch (err) {
      console.error('push failed', err)
    }
  })
  await Promise.all(jobs)
  return sent
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(req, env, url)
      } catch (err) {
        console.error(err)
        return json({ error: 'server' }, 500)
      }
    }
    return env.ASSETS.fetch(req)
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendDueReminders(env, controller.scheduledTime))
  },
}
