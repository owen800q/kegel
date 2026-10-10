import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, finishOnboarding, test } from './fixtures'

async function exportJson(page: Page) {
  await page.goto('/settings')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '匯出所有資料（JSON）' }).click()])
  const text = await readFile((await download.path())!, 'utf8')
  return { text, path: (await download.path())! }
}

test('export → delete all → import restores identical data', async ({ page }) => {
  await page.clock.install()
  await finishOnboarding(page)

  // Make some data: a rated session, a custom routine and changed settings.
  await page.getByRole('button', { name: '開始訓練' }).click()
  await page.getByRole('button', { name: '開始', exact: true }).click()
  await page.clock.runFor(201_000)
  await page.getByText('5', { exact: true }).click()
  await page.getByRole('button', { name: '完成' }).click()

  await page.goto('/train/custom')
  await page.getByLabel('名稱').fill('Lunch')
  await page.getByRole('button', { name: '儲存' }).click()
  await expect(page.getByText('Lunch')).toBeVisible()

  await page.goto('/settings')
  await page.getByRole('button', { name: '增加每日目標' }).click()

  const before = await exportJson(page)
  const payload = JSON.parse(before.text)
  expect(payload.schemaVersion).toBe(1)
  expect(payload.sessions).toHaveLength(1)
  expect(payload.routines).toHaveLength(1)
  expect(payload.settings.dailyTarget).toBe(4)

  await page.getByRole('button', { name: '刪除所有資料' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '全部刪除' }).click()
  await expect(page.getByRole('heading', { name: '找到正確的肌肉' })).toBeVisible()

  await finishOnboarding(page)
  await page.goto('/settings')
  await page.getByTestId('import-input').setInputFiles(before.path)
  await page.getByRole('alertdialog').getByRole('button', { name: '確定' }).click()
  await expect(page.getByText('已匯入')).toBeVisible()

  const after = JSON.parse((await exportJson(page)).text)
  delete payload.exportedAt
  delete after.exportedAt
  expect(after).toEqual(payload)
})

test('rejects a file that is not a backup', async ({ page }) => {
  await finishOnboarding(page)
  await page.goto('/settings')
  await page.getByTestId('import-input').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') })
  await expect(page.getByText('這不是本 App 的備份檔案')).toBeVisible()
})
