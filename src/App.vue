<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useRegisterSW } from 'virtual:pwa-register/vue'
import AppTabbar from './components/AppTabbar.vue'
import PinPad from './components/PinPad.vue'
import UiHost from './components/UiHost.vue'
import { setLocale } from './i18n'
import { verifyPin } from './lib/pin'
import { applyTheme } from './lib/theme'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'

/** Re-lock with the PIN after the app has been in the background this long. */
const RELOCK_AFTER_MS = 60_000

const route = useRoute()
const { t } = useI18n()
const settingsStore = useSettingsStore()
const ui = useUiStore()

// Theme, language and the visible app name follow settings.
watch(
  () => settingsStore.settings.theme,
  (theme) => applyTheme(theme),
)
watch(
  () => settingsStore.settings.locale,
  (locale) => setLocale(locale),
)
watch(
  () => settingsStore.settings.appName,
  (name) => {
    const title = name.trim() || 'Core Timer'
    document.title = title
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', title)
  },
  { immediate: true },
)

// Optional PIN lock.
const locked = ref(Boolean(settingsStore.settings.pinHash))
const pinError = ref('')
let hiddenAt = 0

async function tryUnlock(pin: string) {
  const { pinHash, pinSalt } = settingsStore.settings
  if (!pinHash || !pinSalt || (await verifyPin(pin, pinSalt, pinHash))) {
    locked.value = false
    pinError.value = ''
  } else {
    pinError.value = t('pin.wrong')
  }
}

// Privacy screen: toggled synchronously on the DOM (not via Vue's async
// render) so it is in place before the OS takes its app-switcher snapshot.
function onVisibility() {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now()
    document.body.classList.add('privacy-cover')
  } else {
    document.body.classList.remove('privacy-cover')
    if (settingsStore.settings.pinHash && hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER_MS) locked.value = true
  }
}
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisibility))

// Service worker update prompt.
const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_url, registration) {
    if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
  },
})
watch(needRefresh, async (ready) => {
  if (!ready) return
  const choice = await ui.showDialog({
    body: t('today.updateReady'),
    buttons: [
      { label: t('common.later'), value: 'later', kind: 'default' },
      { label: t('today.updateNow'), value: 'update', kind: 'primary' },
    ],
  })
  if (choice === 'update') await updateServiceWorker(true)
  else needRefresh.value = false
})
watch(offlineReady, (ready) => {
  if (ready) ui.showToast(t('today.offlineReady'), 'none')
})
</script>

<template>
  <div class="weui-tab app-shell">
    <main id="main" class="weui-tab__panel app-main" :class="{ 'app-main_bare': route.meta.bare }">
      <RouterView />
    </main>
    <AppTabbar v-if="!route.meta.bare" />
  </div>
  <UiHost />
  <div v-if="locked" class="lock-screen">
    <PinPad :title="t('pin.enter')" :error="pinError" @complete="tryUnlock" />
  </div>
  <div class="privacy-screen" aria-hidden="true">
    <span>{{ settingsStore.settings.appName || 'Core Timer' }}</span>
  </div>
</template>
