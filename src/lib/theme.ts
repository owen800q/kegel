import type { ThemePref } from '@/types'

/**
 * WeUI follows the OS theme unless `data-weui-theme` pins it. The browser
 * chrome (iOS status bar / Dynamic Island area, Android status bar) is painted
 * with `theme-color`, so keep it equal to the page background (`--weui-BG-0`)
 * to make that area look seamless.
 */
export function applyTheme(theme: ThemePref) {
  const body = document.body
  if (theme === 'system') body.removeAttribute('data-weui-theme')
  else body.setAttribute('data-weui-theme', theme)
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
  syncThemeColor(theme)
}

function syncThemeColor(theme: ThemePref) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  if (theme === 'system') {
    // Restore the per-scheme defaults from index.html.
    for (const m of metas) if (m.dataset.content) m.content = m.dataset.content
    return
  }
  const bg = getComputedStyle(document.body).getPropertyValue('--weui-BG-0').trim()
  if (!bg) return
  for (const m of metas) {
    m.dataset.content ??= m.content
    m.content = bg
  }
}
