const CACHE = 'slideshow-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

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
            if (res.ok) cache.put(event.request, res.clone())
            return res
          })
        })
      )
    )
  } else {
    // HTML pages: network-first so content stays fresh, fall back to cache offline
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(cache => cache.put(event.request, res.clone()))
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
