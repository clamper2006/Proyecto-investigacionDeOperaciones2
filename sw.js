/* =========================================
   STAB PWA — Service Worker v2.2.1
   ========================================= */
const CACHE_NAME = 'stab-v2.2.1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'BYPASS_AUTH_CACHE') {
    console.log('[SW] Bypass auth cache solicitado');
  }
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Bypass para Supabase, OAuth y tokens
  if (
    url.includes('supabase.co') ||
    url.includes('accounts.google.com') ||
    url.includes('access_token=') ||
    url.includes('code=') ||
    url.includes('error=') ||
    url.includes('#')
  ) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).catch(() => {
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
