import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'

/**
 * Drives the real Worker (wrangler dev + local D1) against a mock push
 * service, which verifies the VAPID signature and decrypts the payload the
 * way a browser would (RFC 8291 / RFC 8292).
 */

const enc = new TextEncoder()
const b64 = (b: ArrayBuffer | Uint8Array) => Buffer.from(b as ArrayBuffer).toString('base64url')
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'))

interface Received {
  headers: IncomingMessage['headers']
  body: Uint8Array
  path: string
}

let server: Server
let received: Received[] = []
let port = 0
let pushStatus = 201
let serverKey = ''

test.beforeAll(async ({ request }) => {
  serverKey = (await (await request.get('/api/push/config')).json()).publicKey
  server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      received.push({ headers: req.headers, body: new Uint8Array(Buffer.concat(chunks)), path: req.url ?? '' })
      res.writeHead(pushStatus).end()
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})

test.afterAll(() => new Promise<void>((r) => server.close(() => r())))
test.beforeEach(() => {
  received = []
  pushStatus = 201
})

async function newBrowserKeys() {
  const ua = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair
  const auth = crypto.getRandomValues(new Uint8Array(16))
  const p256dh = b64(await crypto.subtle.exportKey('raw', ua.publicKey))
  return { ua, auth, p256dh }
}

async function hkdf(salt: Uint8Array, ikm: ArrayBuffer | Uint8Array, info: Uint8Array, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm as ArrayBuffer, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, info: info as Uint8Array<ArrayBuffer> }, key, len * 8))
}

async function decrypt(body: Uint8Array, ua: CryptoKeyPair, auth: Uint8Array) {
  const salt = body.slice(0, 16)
  const asPublic = body.slice(21, 21 + body[20])
  const uaPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey))
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256)
  const ikm = await hkdf(auth, ecdh, new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, body.slice(21 + body[20])))
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)))
}

async function verifyVapid(header: string | undefined, audience: string) {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header ?? '')
  expect(m, 'VAPID Authorization header').not.toBeNull()
  expect(m![4]).toBe(serverKey)
  const claims = JSON.parse(Buffer.from(m![2], 'base64url').toString())
  expect(claims.aud).toBe(audience)
  expect(claims.exp * 1000).toBeGreaterThan(Date.now())
  const pub = await crypto.subtle.importKey('raw', unb64(m![4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, unb64(m![3]), enc.encode(`${m![1]}.${m![2]}`))
  expect(ok).toBe(true)
}

function utcHm(offsetMin = 0) {
  const d = new Date(Date.now() + offsetMin * 60_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

test('generates a VAPID key pair once and keeps it', async ({ request }) => {
  const res = await request.get('/api/push/config')
  const body = await res.json()
  expect(body.enabled).toBe(true)
  expect(Buffer.from(body.publicKey, 'base64url')).toHaveLength(65)
  expect(res.headers()['cache-control']).toBe('no-store')
  for (let i = 0; i < 3; i++) expect((await (await request.get('/api/push/config')).json()).publicKey).toBe(body.publicKey)
  // The private key is never exposed.
  expect(JSON.stringify(body)).not.toMatch(/private/i)
})

test('subscribe, test push, scheduled reminder once, unsubscribe', async ({ request }) => {
  const keys = await newBrowserKeys()
  const endpoint = `http://127.0.0.1:${port}/push/${crypto.randomUUID()}`
  const subscription = { endpoint, keys: { p256dh: keys.p256dh, auth: b64(keys.auth) } }
  // A reminder time that is due right now (in UTC), plus one that isn't.
  const times = [utcHm(0), utcHm(180)]

  const sub = await request.post('/api/push/subscribe', { data: { subscription, times, timeZone: 'UTC' } })
  expect(sub.status()).toBe(200)

  // Test notification.
  expect((await request.post('/api/push/test', { data: { endpoint } })).status()).toBe(200)
  expect(received).toHaveLength(1)
  expect(received[0].headers['content-encoding']).toBe('aes128gcm')
  await verifyVapid(received[0].headers.authorization, `http://127.0.0.1:${port}`)
  expect(await decrypt(received[0].body, keys.ua, keys.auth)).toEqual({ type: 'test' })

  // Cron tick: the due reminder is delivered once, not again on the next tick.
  received = []
  await request.get('/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*')
  await expect.poll(() => received.filter((r) => r.path.includes(endpoint.split('/').pop()!)).length).toBe(1)
  const mine = received.find((r) => r.path.includes(endpoint.split('/').pop()!))!
  await verifyVapid(mine.headers.authorization, `http://127.0.0.1:${port}`)
  expect(await decrypt(mine.body, keys.ua, keys.auth)).toEqual({ type: 'reminder', time: times[0] })
  received = []
  await request.get('/cdn-cgi/handler/scheduled?cron=*/5+*+*+*+*')
  await new Promise((r) => setTimeout(r, 500))
  expect(received.filter((r) => r.path.includes(endpoint.split('/').pop()!))).toHaveLength(0)

  // Unsubscribe: the record is gone.
  expect((await request.delete('/api/push/subscribe', { data: { endpoint } })).status()).toBe(200)
  expect((await request.post('/api/push/test', { data: { endpoint } })).status()).toBe(404)
})

test('expired subscriptions are removed', async ({ request }) => {
  const keys = await newBrowserKeys()
  const endpoint = `http://127.0.0.1:${port}/push/${crypto.randomUUID()}`
  await request.post('/api/push/subscribe', {
    data: { subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: b64(keys.auth) } }, times: [], timeZone: 'UTC' },
  })
  pushStatus = 410
  expect((await request.post('/api/push/test', { data: { endpoint } })).status()).toBe(502)
  expect((await request.post('/api/push/test', { data: { endpoint } })).status()).toBe(404)
})

test('rejects bad input and non-push endpoints', async ({ request }) => {
  const keys = await newBrowserKeys()
  const good = { endpoint: `http://127.0.0.1:${port}/push/x`, keys: { p256dh: keys.p256dh, auth: b64(keys.auth) } }
  const cases = [
    { subscription: { ...good, endpoint: 'https://evil.example.com/x' }, times: [], timeZone: 'UTC' },
    { subscription: { ...good, keys: { ...good.keys, auth: 'short' } }, times: [], timeZone: 'UTC' },
    { subscription: good, times: ['25:00'], timeZone: 'UTC' },
    { subscription: good, times: Array(11).fill('08:00'), timeZone: 'UTC' },
    { subscription: good, times: [], timeZone: 'Mars/Olympus' },
  ]
  for (const data of cases) expect((await request.post('/api/push/subscribe', { data })).status()).toBe(400)
  // Must be JSON (blocks simple cross-site form posts).
  const form = await request.post('/api/push/subscribe', { form: { a: '1' } })
  expect(form.status()).toBe(400)
  expect((await request.get('/api/nope')).status()).toBe(404)
})
