import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

/** Don't check more often than this when the app returns to the foreground. */
const MIN_CHECK_INTERVAL_MS = 60_000

/**
 * App updates via the service worker (registerType: 'prompt').
 *
 * Browsers only look for a new sw.js on navigation, so an installed iOS app
 * that is resumed rather than relaunched would never notice an update. We
 * also check when the app comes back to the foreground, hourly while open,
 * and on demand from Settings.
 */
export const useUpdateStore = defineStore('update', () => {
  /** A new version is installed and waiting. Stays true after "Later" so Settings can offer it. */
  const available = ref(false)
  /** Bumped each time a new version is first detected, to trigger the prompt once. */
  const detected = ref(0)
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
    if (ready && !available.value) {
      available.value = true
      detected.value++
    }
  })

  /** Ask the browser to fetch sw.js now. Resolves to true if an update is (or becomes) available. */
  async function check(): Promise<boolean> {
    if (available.value) return true
    if (!registration) return false
    lastCheck = Date.now()
    try {
      await registration.update()
    } catch {
      return false // offline
    }
    // A found update still has to download and install before it is "waiting".
    for (let i = 0; i < 40 && !available.value; i++) {
      if (!registration.installing && !registration.waiting) break
      await new Promise((r) => setTimeout(r, 250))
    }
    return available.value
  }

  function onForeground() {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > MIN_CHECK_INTERVAL_MS) void check()
  }
  document.addEventListener('visibilitychange', onForeground)

  /** Activate the waiting version and reload. */
  function apply() {
    return updateServiceWorker(true)
  }

  return { available, detected, offlineReady, check, apply }
})
