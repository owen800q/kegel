// Renders the neutral app icon to PNGs with the bundled Chromium.
// Usage: npm run icons  (outputs to public/icons)
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const BG = '#1c1c1e'
const FG = '#f2f2f7'

// A plain stopwatch: nothing hints at what the timer is for.
function svg(size, { maskable = false } = {}) {
  const scale = maskable ? 0.62 : 0.8
  const r = maskable ? 0 : size * 0.22
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  <g transform="translate(${size / 2} ${size / 2}) scale(${(size * scale) / 64}) translate(-32 -34)">
    <circle cx="32" cy="36" r="22" fill="none" stroke="${FG}" stroke-width="5"/>
    <path d="M32 36V24" stroke="${FG}" stroke-width="5" stroke-linecap="round"/>
    <rect x="26" y="5" width="12" height="6" rx="3" fill="${FG}"/>
  </g>
</svg>`
}

const targets = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  // iOS applies its own rounded mask, so the touch icon is full-bleed.
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
]

await mkdir('public/icons', { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
const page = await browser.newPage()
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size })
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(t.size, t)}</body></html>`)
  await page.locator('svg').screenshot({ path: `public/icons/${t.file}`, omitBackground: true })
  console.log('wrote', t.file)
}
await browser.close()
