/**
 * Minimal Web Push sender using only Web Crypto (works in Workers and Node):
 * VAPID auth (RFC 8292) and aes128gcm payload encryption (RFC 8291).
 */

export interface PushSubscriptionKeys {
  endpoint: string
  /** base64url, 65-byte uncompressed P-256 point */
  p256dh: string
  /** base64url, 16 bytes */
  auth: string
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point */
  publicKey: string
  /** base64url, 32-byte private scalar */
  privateKey: string
  /** mailto: or https: contact for the push service */
  subject: string
}

const enc = new TextEncoder()

/** Byte arrays backed by a plain ArrayBuffer, as Web Crypto expects. */
type Bytes = Uint8Array<ArrayBuffer>

export function b64urlEncode(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(s: string): Bytes {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

async function hmac(key: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

/** HKDF with a single output block (enough for ≤ 32 bytes). */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const prk = await hmac(salt, ikm)
  return (await hmac(prk, concat(info, new Uint8Array([1])))).slice(0, length)
}

function publicJwk(raw: Bytes): JsonWebKey {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('Expected an uncompressed P-256 public key')
  return { kty: 'EC', crv: 'P-256', x: b64urlEncode(raw.slice(1, 33)), y: b64urlEncode(raw.slice(33, 65)), ext: true }
}

export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer)
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
  return { publicKey: b64urlEncode(pub), privateKey: jwk.d! }
}

/** `Authorization` header value for a request to `endpoint`. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, now = Date.now()): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const claims = {
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 60 * 60,
    sub: vapid.subject,
  }
  const unsigned = `${b64urlEncode(enc.encode(JSON.stringify(header)))}.${b64urlEncode(enc.encode(JSON.stringify(claims)))}`
  const key = await crypto.subtle.importKey(
    'jwk',
    { ...publicJwk(b64urlDecode(vapid.publicKey)), d: vapid.privateKey },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // Web Crypto returns the raw r||s signature that JWS ES256 expects.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)))
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${vapid.publicKey}`
}

/** Encrypt `payload` for one subscription (single aes128gcm record). */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  payload: Uint8Array,
  opts: { salt?: Bytes; serverKeys?: CryptoKeyPair } = {},
): Promise<Bytes> {
  const uaPublic = b64urlDecode(sub.p256dh)
  const authSecret = b64urlDecode(sub.auth)
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const server =
    opts.serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair)
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', server.publicKey)) as ArrayBuffer)
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256))

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // 0x02 marks the last (and only) record.
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))),
  )
  const recordSize = 4096
  const header = new Uint8Array(16 + 4 + 1)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, recordSize)
  header[20] = asPublic.length
  return concat(header, asPublic, ciphertext)
}

export interface SendResult {
  status: number
  /** The subscription is gone and should be deleted. */
  expired: boolean
}

export async function sendPush(
  sub: PushSubscriptionKeys,
  payload: unknown,
  vapid: VapidKeys,
  opts: { ttl?: number; fetcher?: typeof fetch } = {},
): Promise<SendResult> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(payload)))
  const res = await (opts.fetcher ?? fetch)(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(opts.ttl ?? 30 * 60),
      Urgency: 'normal',
    },
    body,
  })
  if (!res.ok) console.warn('push service rejected', res.status, (await res.text().catch(() => '')).slice(0, 200))
  return { status: res.status, expired: res.status === 404 || res.status === 410 }
}
