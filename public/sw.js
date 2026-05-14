const CACHE = 'slideshow-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Only handle http/https — ignore chrome-extension://, data:, etc.
  if (!url.protocol.startsWith('http')) return

  // Next.js static chunks are content-addressed → cache-first forever
  const isImmutable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(js|css|woff2?|png|svg|ico|webp)$/)

  if (isImmutable) {
    event.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(event.request).then(hit => {
          if (hit) return hit
          return fetch(event.request).then(res => {
            // Clone synchronously before returning so the body isn't consumed yet
            if (res.ok) cache.put(event.request, res.clone())
            return res
          })
        })
      )
    )
  } else {
    // HTML pages: network-first, fall back to cache when offline
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            // Clone synchronously here — doing it inside an async .then() would
            // race against the body already being streamed to the page
            const clone = res.clone()
            caches.open(CACHE).then(cache => cache.put(event.request, clone))
          }
          return res
        })
        .catch(() =>
          caches.open(CACHE).then(cache =>
            cache.match(event.request).then(hit => hit ?? new Response('Offline', { status: 503 }))
          )
        )
    )
  }
})
