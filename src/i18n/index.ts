import { createI18n } from 'vue-i18n'
import en from './en.json'
import zhHK from './zh-HK.json'
import type { Locale } from '@/types'

export type MessageSchema = typeof zhHK

export const i18n = createI18n<[MessageSchema], Locale, false>({
  legacy: false,
  locale: 'zh-HK',
  fallbackLocale: 'en',
  messages: { 'zh-HK': zhHK, en },
})

export function setLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
}
