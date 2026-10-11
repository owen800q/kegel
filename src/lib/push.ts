/** Web Push reminders: browser subscription plus the Worker API (`/api/push/*`). */

export type PushSupport =
  | 'supported'
  /** iOS/iPadOS Safari: only works once added to the Home Screen (iOS 16.4+). */
  | 'needs-install'
  | 'unsupported'

export function pushSupport(): PushSupport {
  const nav = navigator as Navigator & { standalone?: boolean }
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const standalone = nav.standalone === true || matchMedia('(display-mode: standalone)').matches
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (ios && !standalone) return 'needs-install'
  return apis ? 'supported' : 'unsupported'
}

export class PushError extends Error {
  constructor(public readonly code: 'denied' | 'not-configured' | 'network' | 'failed') {
    super(code)
  }
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const bin = atob(b64url.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

async function api(path: string, method: string, body?: unknown): Promise<Response> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new PushError('network')
  }
  if (res.status === 503) throw new PushError('not-configured')
  if (!res.ok) throw new PushError('failed')
  return res
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

function timeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Ask permission, subscribe and register the reminder times. Must run from a user gesture. */
export async function enablePush(times: readonly string[]): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushError('denied')
  await subscribeAndRegister(times)
}

/** Subscribe (reusing a valid existing subscription) and upsert it on the server. Needs permission already granted. */
async function subscribeAndRegister(times: readonly string[]): Promise<void> {
  const config = (await (await api('/api/push/config', 'GET')).json()) as { enabled: boolean; publicKey: string | null }
  if (!config.enabled || !config.publicKey) throw new PushError('not-configured')

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  const key = keyBytes(config.publicKey)
  // A subscription made with a different server key can't be reused.
  const existingKey = sub?.options.applicationServerKey
  if (sub && existingKey && new Uint8Array(existingKey).join() !== key.join()) {
    await sub.unsubscribe()
    sub = null
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await api('/api/push/subscribe', 'POST', { subscription: sub.toJSON(), times, timeZone: timeZone() })
}

/**
 * On app start with push enabled: make sure this device is subscribed and the
 * server has the current times and time zone. Re-subscribes silently if the
 * browser lost the subscription (e.g. restored backup, iOS dropping it).
 * Never deletes anything: the only outcome that should turn the setting off
 * is 'denied' (the user revoked notification permission).
 */
export async function restorePush(times: readonly string[]): Promise<'ok' | 'denied' | 'error'> {
  if (pushSupport() !== 'supported') return 'error' // e.g. opened in a Safari tab: leave settings alone
  try {
    const reg = await navigator.serviceWorker.ready
    const state = await reg.pushManager
      .permissionState({ userVisibleOnly: true })
      .catch(() => Notification.permission as PermissionState | 'default')
    if (state === 'denied') return 'denied'
    if (state !== 'granted') return 'error' // 'prompt' can be transient on iOS; don't act on it
    await subscribeAndRegister(times)
    return 'ok'
  } catch {
    return 'error'
  }
}

/** Update the server copy of the reminder times (no-op if not subscribed). */
export async function syncPushTimes(times: readonly string[]): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/api/push/subscribe', 'POST', { subscription: sub.toJSON(), times, timeZone: timeZone() })
}

/** Unsubscribe in the browser and delete the server record. Best effort on the server side. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await api('/api/push/subscribe', 'DELETE', { endpoint }).catch(() => {})
}

export async function sendTestPush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) throw new PushError('failed')
  await api('/api/push/test', 'POST', { endpoint: sub.endpoint })
}
