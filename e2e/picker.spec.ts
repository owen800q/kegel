import { devices } from '@playwright/test'
import { expect, finishOnboarding, test } from './fixtures'

// iPhone screen size; Chromium stands in for WebKit, which isn't installed in CI.
const { defaultBrowserType: _webkit, ...iphone } = devices['iPhone 13']
test.use(iphone)

test('time picker: selected row sits in the indicator, above the tab bar, and saves', async ({ page }) => {
  await finishOnboarding(page)
  await page.goto('/settings')
  await page.getByRole('button', { name: /提醒 2/ }).click()

  const minutes = page.locator('.picker-scroll').nth(1)
  await minutes.evaluate((el) => el.scrollBy(0, 56 * 2 + 20)) // lands between rows, then snaps
  await expect(minutes.locator('[aria-selected="true"]')).toHaveText('02')

  const geometry = await page.evaluate(() => {
    const ind = document.querySelectorAll('.weui-picker__indicator')[1].getBoundingClientRect()
    const sel = document.querySelectorAll('.picker-scroll')[1].querySelector('[aria-selected="true"]')!.getBoundingClientRect()
    const picker = document.querySelector('.weui-picker')!.getBoundingClientRect()
    const hit = document.elementFromPoint(20, picker.bottom - 20)
    return { offset: Math.abs(ind.top + ind.height / 2 - (sel.top + sel.height / 2)), onTop: Boolean(hit?.closest('.weui-picker')) }
  })
  expect(geometry.offset).toBeLessThan(1)
  expect(geometry.onTop).toBe(true)

  await page.getByRole('button', { name: '確定' }).click()
  await expect(page.getByRole('button', { name: /提醒 2/ })).toContainText('13:02')
})
