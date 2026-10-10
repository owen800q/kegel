import { test as base, expect, type Page } from '@playwright/test'

/** Fails the test on console errors (incl. CSP violations) or any request to another origin. */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page, baseURL }, use) => {
      const problems: string[] = []
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console: ${m.text()}`)
      })
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))
      page.on('request', (r) => {
        const url = r.url()
        if (!url.startsWith(baseURL!) && !url.startsWith('blob:') && !url.startsWith('data:')) {
          problems.push(`external request: ${url}`)
        }
      })
      await use()
      expect(problems).toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

export async function finishOnboarding(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '下一步' }).click()
  await page.getByRole('button', { name: '開始使用' }).click()
  await expect(page.getByRole('heading', { name: '今日', level: 1 })).toBeVisible()
}
