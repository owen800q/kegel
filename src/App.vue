<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppTabbar from './components/AppTabbar.vue'
import PinPad from './components/PinPad.vue'
import UiHost from './components/UiHost.vue'
import { setLocale } from './i18n'
import { verifyPin } from './lib/pin'
import { disablePush, syncPushTimes } from './lib/push'
import { applyTheme } from './lib/theme'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import { useUpdateStore } from './stores/update'

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
// With discreet mode on, nothing outside the app's own screens names the training.
watch(
  () => [settingsStore.settings.appName, settingsStore.settings.discreetMode, settingsStore.settings.locale] as const,
  ([name, discreet]) => {
    const appName = name.trim() || 'Core Timer'
    document.title = discreet ? appName : `${appName} · ${t('app.trainingName')}`
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', appName)
  },
  { immediate: true },
)

// Keep the server's copy of the reminder times in step with settings.
let pushSyncTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => [...settingsStore.settings.reminderTimes].sort().join(),
  () => {
    if (!settingsStore.settings.pushEnabled) return
    clearTimeout(pushSyncTimer)
    pushSyncTimer = setTimeout(() => void syncPushTimes(settingsStore.settings.reminderTimes).catch(() => {}), 800)
  },
)

// If permission was revoked or this is an imported backup from another device,
// there is no subscription here: reflect that in settings.
onMounted(async () => {
  if (!settingsStore.settings.pushEnabled || !('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager?.getSubscription()
  if (!sub || !('Notification' in window) || Notification.permission !== 'granted') {
    await disablePush().catch(() => {})
    await settingsStore.update({ pushEnabled: false })
  } else {
    // Refresh times and time zone (it may have changed while travelling).
    void syncPushTimes(settingsStore.settings.reminderTimes).catch(() => {})
  }
})

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

// Service worker update prompt (shown once per new version; Settings offers it afterwards).
const update = useUpdateStore()
watch(
  () => update.detected,
  async () => {
    const choice = await ui.showDialog({
      body: t('today.updateReady'),
      buttons: [
        { label: t('common.later'), value: 'later', kind: 'default' },
        { label: t('today.updateNow'), value: 'update', kind: 'primary' },
      ],
    })
    if (choice === 'update') await update.apply()
  },
)
watch(
  () => update.offlineReady,
  (ready) => {
    if (ready) ui.showToast(t('today.offlineReady'), 'none')
  },
)
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
