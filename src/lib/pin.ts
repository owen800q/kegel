/**
 * PIN hashing for the optional privacy lock. This is a privacy screen, not
 * security: a 4-digit PIN is trivially brute-forced from the stored hash.
 */
export function newSalt(): string {
  return toHex(crypto.getRandomValues(new Uint8Array(16)))
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`)
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  return (await hashPin(pin, salt)) === hash
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
