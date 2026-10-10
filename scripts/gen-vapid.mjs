// Prints a new VAPID key pair for Web Push (base64url). No dependencies.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const b64url = (buf) => Buffer.from(buf).toString('base64url')
const pub = b64url(await crypto.subtle.exportKey('raw', pair.publicKey))
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
console.log(`VAPID_PUBLIC_KEY=${pub}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
