import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/** Don't check more often than this when the app returns to the foreground. */
const MIN_CHECK_INTERVAL_MS = 60_000

/**
 * Automatic app updates. A new service worker is detected on start, when the
 * app returns to the foreground (installed iOS apps resume rather than
 * relaunch) and hourly; App.vue then applies it as soon as the user isn't in
 * the middle of something.
 */
export const useUpdateStore = defineStore('update', () => {
  /** A new version is downloaded and waiting to be applied. */
  const available = ref(false)
  let registration: ServiceWorkerRegistration | undefined
  let lastCheck = 0

  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      registration = reg
      lastCheck = Date.now()
      if (reg) setInterval(() => void check(), 60 * 60 * 1000)
    },
  })

  watch(needRefresh, (ready) => {
    if (ready) available.value = true
  })

  async function check() {
    if (available.value || !registration) return
    lastCheck = Date.now()
    await registration.update().catch(() => {}) // offline: try again later
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_CHECK_INTERVAL_MS) void check()
  })

  /** Activate the waiting version and reload. */
  function apply() {
    return updateServiceWorker(true)
  }

  return { available, offlineReady, apply }
})
