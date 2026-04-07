// AlltagsEngel Service Worker
const CACHE_NAME = 'alltagsengel-v1'
const OFFLINE_URL = '/offline.html'

// Assets to pre-cache
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png',
]

// Install — pre-cache offline page
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
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

// Fetch — network first, fallback to cache/offline
self.addEventListener('fetch', (event) => {
  // Skip non-GET, chrome-extension, API calls
  if (event.request.method !== 'GET') return
  if (event.request.url.includes('/api/')) return
  if (event.request.url.startsWith('chrome-extension://')) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (response.ok && (
          event.request.url.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/) ||
          event.request.destination === 'image'
        )) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => {
        // Try cache first
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          // Navigation requests → offline page
          if (event.request.mode === 'navigate') {
            return caches.match(OFFLINE_URL)
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
    self.registration.showNotification(data.title || 'AlltagsEngel', {
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
      const client = clients.find((c) => c.url.includes('alltagsengel.care'))
      if (client) {
        client.navigate(url)
        return client.focus()
      }
      return self.clients.openWindow(url)
    })
  )
})
