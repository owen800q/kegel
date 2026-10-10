/* Push handling, imported into the Workbox-generated service worker.
   Notification text is always neutral; the language and app name come from
   the app's own IndexedDB settings so the server never needs to know them. */

const TEXT = {
  'zh-HK': { reminder: '是時候休息 5 分鐘了', test: '通知已啟用' },
  en: { reminder: 'Time for your 5-minute break', test: 'Notifications are working' },
}

function readSettings() {
  return new Promise((resolve) => {
    let req
    try {
      req = indexedDB.open('core-timer')
    } catch {
      resolve(null)
      return
    }
    // The app owns the schema: never create the database from here.
    req.onupgradeneeded = () => req.transaction.abort()
    req.onerror = () => resolve(null)
    req.onsuccess = () => {
      const db = req.result
      try {
        const get = db.transaction('settings').objectStore('settings').get('settings')
        get.onsuccess = () => {
          resolve(get.result || null)
          db.close()
        }
        get.onerror = () => {
          resolve(null)
          db.close()
        }
      } catch {
        resolve(null)
        db.close()
      }
    }
  })
}

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {}
      try {
        data = event.data ? event.data.json() : {}
      } catch {
        data = {}
      }
      const settings = await readSettings()
      const lang = settings && settings.locale === 'en' ? 'en' : 'zh-HK'
      const title = (settings && settings.appName && settings.appName.trim()) || 'Core Timer'
      await self.registration.showNotification(title, {
        body: data.type === 'test' ? TEXT[lang].test : TEXT[lang].reminder,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        tag: 'core-timer-reminder',
        renotify: true,
        data: { url: '/' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = all.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        return
      }
      await self.clients.openWindow('/')
    })(),
  )
})

// The browser rotated the subscription: re-register it with the same reminder times.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      const settings = await readSettings()
      if (!settings || !settings.pushEnabled) return
      let sub = event.newSubscription
      if (!sub) {
        const res = await fetch('/api/push/config')
        const { publicKey } = await res.json()
        if (!publicKey) return
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
        sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      }
      if (event.oldSubscription) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
        })
      }
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          times: settings.reminderTimes || [],
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
    })(),
  )
})
