const CACHE = 'mifinanza-v6';
const ASSETS = ['/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  // skipWaiting incondicional: el nuevo SW toma control inmediatamente
  // sin esperar a que cierren las pestañas abiertas
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Peticiones externas: sin interferencia
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('googleapis')
  ) return;

  const isImage = /\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname);

  if (isImage) {
    // Cache-first para imágenes e iconos
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        });
      })
    );
    return;
  }

  // Network-first para HTML, JS y resto
  // cache: 'no-cache' fuerza validación con el servidor en cada recarga normal,
  // ignorando la HTTP cache del navegador (que es lo que falla sin Ctrl+Shift+R)
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .catch(() => caches.match(e.request))
  );
});
