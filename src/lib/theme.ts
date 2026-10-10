import type { ThemePref } from '@/types'

/** WeUI follows the OS theme unless `data-weui-theme` pins it. */
export function applyTheme(theme: ThemePref) {
  const body = document.body
  if (theme === 'system') body.removeAttribute('data-weui-theme')
  else body.setAttribute('data-weui-theme', theme)
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
}
