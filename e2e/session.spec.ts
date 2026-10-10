import { expect, finishOnboarding, test } from './fixtures'

test('completes a Beginner session with accurate timing, even after a 30 s stall', async ({ page }) => {
  await page.clock.install()
  await finishOnboarding(page)

  await page.getByRole('button', { name: '開始訓練' }).click()
  await expect(page.getByText('3:20')).toBeVisible() // 3 × 10 × 6 s + 2 × 10 s rest
  await page.getByRole('button', { name: '開始', exact: true }).click()

  const ring = page.locator('.ring__label')
  await expect(ring).toHaveText('收緊')
  await page.clock.runFor(3_500)
  await expect(ring).toHaveText('放鬆')

  // Simulate a backgrounded tab: time jumps 30 s with no timers firing in between.
  await page.clock.fastForward(30_000)
  await page.clock.runFor(200)
  // 33.7 s in → rep 6 (30–36 s), in its relax phase: timing comes from timestamps, not ticks.
  await expect(page.getByText('第 6 / 10 次')).toBeVisible()
  await expect(ring).toHaveText('放鬆')

  await page.getByRole('button', { name: '暫停' }).click()
  await page.clock.runFor(60_000) // paused time doesn't count
  await page.getByRole('button', { name: '繼續' }).click()

  await page.clock.runFor(200_000 - 33_700 + 500)
  await expect(page.getByRole('heading', { name: '訓練完成' })).toBeVisible()
  // Active duration excludes the pause and lands exactly on the planned length.
  await expect(page.locator('.summary-stats')).toContainText('3:20')
  await expect(page.locator('.summary-stats')).toContainText('30 / 30')
  await expect(page.locator('.summary-stats')).toContainText('3 / 3')

  await page.getByText('4', { exact: true }).click()
  await page.getByLabel('備註（可選）').fill('steady')
  await page.getByRole('button', { name: '完成' }).click()

  await expect(page.getByText('已完成 1 / 3 節')).toBeVisible()

  // Persists across reloads.
  await page.reload()
  await expect(page.getByText('已完成 1 / 3 節')).toBeVisible()
  await page.getByRole('link', { name: '進度' }).click()
  await page.getByRole('link', { name: /初級/ }).click()
  await expect(page.getByText('4 / 5')).toBeVisible()
  await expect(page.getByText('steady')).toBeVisible()
})

test('ending early saves an incomplete session', async ({ page }) => {
  await page.clock.install()
  await finishOnboarding(page)
  await page.getByRole('button', { name: '開始訓練' }).click()
  await page.getByRole('button', { name: '開始', exact: true }).click()
  await page.clock.runFor(13_000)
  await page.getByRole('button', { name: '結束' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '結束' }).click()
  await expect(page.getByRole('heading', { name: '已提早結束' })).toBeVisible()
  await expect(page.locator('.summary-stats')).toContainText('2 / 30')
  await page.getByRole('button', { name: '完成' }).click()
  // Incomplete sessions don't count towards today's target.
  await expect(page.getByText('已完成 0 / 3 節')).toBeVisible()
})
