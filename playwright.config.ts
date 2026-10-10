import { generateKeyPairSync } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const PORT = 8788

// Throwaway VAPID keys for the local Worker; the push tests read the public key from env.
if (!process.env.TEST_VAPID_PUBLIC) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const jwk = privateKey.export({ format: 'jwk' })
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x!, 'base64url'), Buffer.from(jwk.y!, 'base64url')])
  process.env.TEST_VAPID_PUBLIC = pub.toString('base64url')
  process.env.TEST_VAPID_PRIVATE = jwk.d!
}

// Runs against `wrangler dev` so the real asset config and headers (CSP etc.) apply.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['Pixel 7'],
    locale: 'zh-HK',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command:
      `npm run build && npx wrangler dev --port ${PORT} --test-scheduled --var PUSH_ALLOW_LOCALHOST:1 ` +
      `--var VAPID_PUBLIC_KEY:${process.env.TEST_VAPID_PUBLIC} --var VAPID_PRIVATE_KEY:${process.env.TEST_VAPID_PRIVATE}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
