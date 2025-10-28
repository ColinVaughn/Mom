const CACHE_NAME = 'mom-receipts-v2'; // Updated: CDN bypass for OCR workers
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon.svg',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => k !== CACHE_NAME ? caches.delete(k) : undefined)))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass non-GET and auth/function requests
  if (req.method !== 'GET' || url.pathname.startsWith('/functions/v1') || url.pathname.includes('/auth/')) {
    return;
  }

  // CRITICAL: Bypass CDN requests for tesseract.js worker files (don't cache, don't intercept)
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com') {
    return; // Let browser fetch directly
  }

  // Cache-First for Supabase Storage receipts images (signed/public URLs)
  if (url.href.includes('/storage/v1/object') && url.href.includes('/receipts/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req)
        if (cached) return cached
        try {
          const res = await fetch(req)
          // Opaque or ok responses can be cached
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone())
          }
          return res
        } catch (e) {
          return cached || Promise.reject(e)
        }
      })
    )
    return;
  }

  // For navigation requests, use cache-first fallback to index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: stale-while-revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    })
  );
});
