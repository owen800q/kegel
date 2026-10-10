import { readFile } from 'node:fs/promises'
import { expect, finishOnboarding, test } from './fixtures'

const SENSITIVE = /kegel|pelvic|盆底/i

test('discreet mode: title, manifest and .ics stay neutral', async ({ page, request }) => {
  await finishOnboarding(page)
  expect(await page.title()).toBe('Core Timer')
  expect(await page.title()).not.toMatch(SENSITIVE)

  const manifest = await (await request.get('/manifest.webmanifest')).text()
  expect(JSON.parse(manifest).name).toBe('Core Timer')
  expect(manifest).not.toMatch(SENSITIVE)
  expect(await (await request.get('/')).text()).not.toMatch(SENSITIVE)

  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出到日曆（.ics）' }).click()])
  const ics = await readFile((await download.path())!, 'utf8')
  expect(ics).toContain('SUMMARY:Core 5 min')
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3)
  expect(ics).not.toMatch(SENSITIVE)

  // Turning discreet mode off is what allows the title to name the training.
  await page.getByLabel('低調模式').uncheck()
  await expect(page).toHaveTitle(/盆底肌/)
  await page.getByLabel('低調模式').check()
  await expect(page).toHaveTitle('Core Timer')
})

test('security headers are set', async ({ request }) => {
  const res = await request.get('/')
  const h = res.headers()
  expect(h['content-security-policy']).toContain("default-src 'self'")
  expect(h['content-security-policy']).not.toContain('unsafe-inline')
  expect(h['referrer-policy']).toBe('no-referrer')
  expect(h['permissions-policy']).toContain('screen-wake-lock=(self)')
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache')
  expect((await request.get('/manifest.webmanifest')).headers()['cache-control']).toBe('no-cache')
})

test('works offline after the first load', async ({ page, context }) => {
  await finishOnboarding(page)
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.state
  })
  // Wait until the service worker controls the page and has precached everything.
  await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '今日', level: 1 })).toBeVisible()
  await page.goto('/progress')
  await expect(page.getByRole('heading', { name: '進度', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: '設定' }).click()
  await expect(page.getByRole('heading', { name: '設定', level: 1 })).toBeVisible()
  await context.setOffline(false)
})

test('English locale renders without Chinese UI strings', async ({ page }) => {
  await finishOnboarding(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: /語言/ }).click()
  await page.getByRole('button', { name: 'English' }).click()
  for (const path of ['/', '/train', '/progress', '/settings']) {
    await page.goto(path)
    const text = await page.locator('#app').innerText()
    // Only the language name itself may stay in Chinese.
    expect(text.replace('繁體中文（香港）', '')).not.toMatch(/[一-鿿]/)
  }
})
