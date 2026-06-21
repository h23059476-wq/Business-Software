const CACHE_NAME = 'worksuite-cache-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use individual caching to allow service worker installation even if
      // certain assets are dynamically modified or temporarily unavailable during active dev.
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) => {
          return cache.add(url).catch((err) => {
            console.warn(`[WorkSuite SW] Non-critical: failed to pre-cache ${url}:`, err);
          });
        })
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Pass through POST requests, API routes, Firebase/Firestore, and hot-reload WebSockets
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('/api/') || 
    event.request.url.includes('firebase') ||
    event.request.url.includes('firestore') ||
    event.request.url.includes('/@vite/') ||
    event.request.url.includes('vite') ||
    event.request.url.includes('hmr') ||
    event.request.url.includes('socket') ||
    event.request.url.startsWith('chrome-extension')
  ) {
    return;
  }

  // Network-First (with Cache Fallback) Strategy
  // This is crucial for developer previews so they always run live code changes instantly.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // If we get a valid response, cache it and return it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If network request fails, fall back to cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If the request is for an HTML navigation page, return cached root as a fallback
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Network error occurred', {
            status: 481,
            statusText: 'Network Error'
          });
        });
      })
  );
});
