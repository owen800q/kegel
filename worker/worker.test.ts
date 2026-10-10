import { describe, expect, it } from 'vitest'
import { dueTimes, localClock } from './schedule'
import { isAllowedEndpoint } from './index'
import { b64urlDecode, b64urlEncode, encryptPayload, generateVapidKeys, sendPush, vapidAuthorization } from './webpush'

const enc = new TextEncoder()

/** Receiver side of RFC 8291, written from the spec independently of the sender. */
async function decrypt(body: Uint8Array, uaKeys: CryptoKeyPair, authSecret: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', uaKeys.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256)
  const hkdf = async (salt: Uint8Array, ikm: ArrayBuffer | Uint8Array, info: Uint8Array, len: number) => {
    const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8))
  }
  const keyInfo = new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic])
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext))
  expect(plain.at(-1)).toBe(2) // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1))
}

async function browserSubscription() {
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)))
  return { ua, auth, keys: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh, auth: b64urlEncode(auth) } }
}

describe('web push', () => {
  it('base64url round-trips', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(37))
    expect(b64urlDecode(b64urlEncode(bytes))).toEqual(bytes)
  })

  it('encrypts a payload the browser can decrypt', async () => {
    const { ua, auth, keys } = await browserSubscription()
    const body = await encryptPayload(keys, enc.encode('{"type":"reminder","time":"08:00"}'))
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096)
    expect(body[20]).toBe(65)
    expect(await decrypt(body, ua, auth)).toBe('{"type":"reminder","time":"08:00"}')
  })

  it('signs a VAPID JWT that verifies with the public key', async () => {
    const vapid = { ...(await generateVapidKeys()), subject: 'mailto:test@example.com' }
    expect(b64urlDecode(vapid.publicKey)).toHaveLength(65)
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 1_700_000_000_000)
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!
    expect(m[4]).toBe(vapid.publicKey)
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(m[2])))
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_700_000_000 + 43_200, sub: 'mailto:test@example.com' })
    const pub = await crypto.subtle.importKey('raw', b64urlDecode(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(m[3]), enc.encode(`${m[1]}.${m[2]}`))
    expect(ok).toBe(true)
  })

  it('sends with the right headers and flags gone subscriptions', async () => {
    const { keys } = await browserSubscription()
    const vapid = { ...(await generateVapidKeys()), subject: 'mailto:test@example.com' }
    let seen: RequestInit | undefined
    const fetcher = (async (_url: string, init: RequestInit) => {
      seen = init
      return new Response(null, { status: 410 })
    }) as unknown as typeof fetch
    const result = await sendPush(keys, { type: 'test' }, vapid, { fetcher })
    expect(result).toEqual({ status: 410, expired: true })
    const h = seen!.headers as Record<string, string>
    expect(h['Content-Encoding']).toBe('aes128gcm')
    expect(h.Authorization).toMatch(/^vapid t=/)
    expect(Number(h.TTL)).toBeGreaterThan(0)
  })
})

describe('schedule', () => {
  // 2026-10-10 08:03 in Hong Kong (UTC+8) = 00:03 UTC
  const at0803 = Date.UTC(2026, 9, 10, 0, 3)

  it('reads local time in the subscriber time zone', () => {
    expect(localClock(at0803, 'Asia/Hong_Kong')).toEqual({ day: '2026-10-10', minutes: 8 * 60 + 3 })
    expect(localClock(at0803, 'UTC')).toEqual({ day: '2026-10-10', minutes: 3 })
  })

  it('is due within the window, once per day', () => {
    const times = ['08:00', '13:00', '21:00']
    expect(dueTimes(times, 'Asia/Hong_Kong', {}, at0803)).toEqual(['08:00'])
    expect(dueTimes(times, 'Asia/Hong_Kong', { '08:00': '2026-10-10' }, at0803)).toEqual([])
    expect(dueTimes(times, 'Asia/Hong_Kong', { '08:00': '2026-10-09' }, at0803)).toEqual(['08:00'])
    expect(dueTimes(times, 'Asia/Hong_Kong', {}, at0803 - 4 * 60_000)).toEqual([]) // 07:59
    expect(dueTimes(times, 'Asia/Hong_Kong', {}, at0803 + 12 * 60_000)).toEqual([]) // 08:15
    expect(dueTimes(times, 'Europe/London', {}, at0803)).toEqual([])
  })
})

describe('endpoint allowlist', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/x', true],
    ['https://jmt17.google.com/fcm/send/x', true],
    ['https://google.com.evil.com/x', false],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://web.push.apple.com/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/x', false],
    ['https://evil.example.com/x', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['http://localhost:9999/push', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => {
    expect(isAllowedEndpoint(url)).toBe(ok)
  })

  it('allows localhost only when enabled for local testing', () => {
    expect(isAllowedEndpoint('http://localhost:9999/push', true)).toBe(true)
  })
})
