import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'weui/dist/style/weui.min.css'
import './styles/app.css'
import App from './App.vue'
import { i18n, setLocale } from './i18n'
import { router } from './router'
import { useSessionStore } from './stores/session'
import { useSettingsStore } from './stores/settings'
import { applyTheme } from './lib/theme'

async function boot() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia).use(i18n)

  // Load settings before the first render so theme, language and the
  // onboarding redirect are right from the first frame.
  const settingsStore = useSettingsStore()
  try {
    await Promise.all([settingsStore.load(), useSessionStore().load()])
  } catch (err) {
    console.error('Could not open local database', err)
  }
  setLocale(settingsStore.settings.locale)
  applyTheme(settingsStore.settings.theme)

  app.use(router)
  await router.isReady()
  app.mount('#app')
}

void boot()
