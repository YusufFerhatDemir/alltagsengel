// Alltagsengel Service Worker
// Version bei relevanten Änderungen bumpen — activate löscht dann alte Caches
// (gecachte Next.js-Chunks aus früheren Deploys würden sonst unbegrenzt anwachsen).
const CACHE_NAME = 'alltagsengel-v3'
const OFFLINE_URL = '/offline.html'
const MAX_RUNTIME_ENTRIES = 200

// Assets to pre-cache
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
]

// Install — pre-cache offline page (einzeln, damit ein 404 nicht die
// ganze Installation kippt und die Offline-Seite nie funktioniert)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_ASSETS.map((asset) =>
          cache.add(asset).catch(() => { /* Asset fehlt → Rest trotzdem cachen */ })
        )
      )
    )
  )
  self.skipWaiting()
})

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Cache grob begrenzen: älteste Einträge löschen, wenn Limit überschritten
async function trimCache() {
  const cache = await caches.open(CACHE_NAME)
  const keys = await cache.keys()
  if (keys.length <= MAX_RUNTIME_ENTRIES) return
  // FIFO: die ältesten (zuerst eingefügten) Einträge entfernen
  await Promise.all(keys.slice(0, keys.length - MAX_RUNTIME_ENTRIES).map((k) => cache.delete(k)))
}

// Fetch — network first, fallback to cache/offline
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // NUR same-origin. Fremde Origins (Supabase, Analytics, CDNs) gehen
  // unangetastet ans Netzwerk.
  //
  // Vorher fing der Worker auch cross-origin-GETs ab. Schlug ein solcher
  // fetch fehl — CORS-Preflight, Netzwerkwackler, Verbindungsabbruch —
  // lieferte der catch-Zweig unten ein LEERES 503 zurueck. supabase-js sah
  // dann statt des echten Fehlers eine kaputte Antwort, und der Nutzer
  // bekam „Anmeldung fehlgeschlagen" statt eines Netzwerkhinweises.
  // Ausserdem lief jeder Supabase-Aufruf unnoetig durch den Worker.
  if (url.origin !== self.location.origin) return

  // Eigene API-Routen nie cachen — sie sind pro Anfrage verschieden.
  if (url.pathname.startsWith('/api/')) return
  if (event.request.url.startsWith('chrome-extension://')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (
          url.pathname.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/) ||
          event.request.destination === 'image'
        )) {
          const clone = response.clone()
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .then(() => trimCache())
            .catch(() => { /* Quota voll o. ä. — nicht kritisch */ })
        }
        return response
      })
      .catch(() => {
        // Try cache first
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // Navigation requests → offline page (Fallback, falls Precache fehlschlug)
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL).then(
              (offline) => offline ?? new Response('Offline', { status: 503, statusText: 'Offline' })
            )
          }
          return new Response('', { status: 503, statusText: 'Offline' })
        })
      })
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return
  let data = {}
  try { data = event.data.json() } catch { data = { body: event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Alltagsengel', {
      body: data.body || '',
      icon: '/icon-192x192.png',
      badge: '/icon-192x192.png',
      tag: data.tag || 'default',
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || '/' },
      actions: data.actions || [],
    })
  )
})

// Notification click — open app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // origin-basiert statt hardcoded Domain → funktioniert auch auf Preview/localhost
      const client = clients.find((c) => c.url.startsWith(self.location.origin))
      if (client) {
        return Promise.resolve(client.navigate(url))
          .catch(() => { /* uncontrolled client — navigate kann fehlschlagen */ })
          .then(() => client.focus())
      }
      return self.clients.openWindow(url)
    })
  )
})
