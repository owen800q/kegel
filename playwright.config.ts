import { defineConfig, devices } from '@playwright/test'

const PORT = 8788


// Runs against `wrangler dev` (which builds first, see wrangler.jsonc) so the real asset config and headers (CSP etc.) apply.
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
      // No VAPID secrets: the Worker generates and stores its own key pair in local D1.
      `npx wrangler dev --port ${PORT} --test-scheduled --var PUSH_ALLOW_LOCALHOST:1`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
