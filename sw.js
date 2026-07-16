/* =========================================
   STAB PWA — Service Worker v2.1.0-Supabase
   ========================================= */
const CACHE_NAME = 'stab-v2.1.0-supabase';
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
    caches.open(CACHE_NAME).then(cache => {
      // Precargar los recursos locales estáticos esenciales de inmediato
      return cache.addAll(ASSETS);
    })
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

// Escuchar mensajes globales desde el frontend
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'BYPASS_AUTH_CACHE') {
    console.log('[SW] Ignorando cachés estáticas por evento OAuth en tránsito');
  }
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // REGLAS CRÍTICAS DE BYPASS PARA AUTENTICACIÓN:
  // 1. Omitir base de datos de Supabase.
  // 2. Omitir llamadas de login/callback OAuth de Google.
  // 3. Omitir tokens en Hash o parámetros de URL en redirect de Supabase.
  if (
    url.includes('supabase.co') || 
    url.includes('accounts.google.com') ||
    url.includes('access_token=') ||
    url.includes('error=') ||
    url.includes('#')
  ) {
    return; // Permite que el navegador gestione de forma nativa la autenticación en línea
  }

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Network First fallback con control de caídas offline
      return cached || fetch(e.request).catch(() => {
        if (e.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
