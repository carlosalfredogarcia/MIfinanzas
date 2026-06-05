const CACHE = 'mifinanza-v5';
const ASSETS = [
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Supabase, CDN y externos: siempre red, sin interferencia
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('googleapis')
  ) return;

  const isImage = /\.(png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname);
  const isCodeFile = /\.(js|html)$/.test(url.pathname) || url.pathname === '/';

  if (isImage) {
    // Cache-first para imágenes e iconos
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          }
          return res;
        });
      })
    );
    return;
  }

  if (isCodeFile) {
    // Network-first para HTML y JS: siempre intenta red, cae a caché si offline
    e.respondWith(
      fetch(e.request).then(res => {
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Resto (manifest.json, etc.): network-first también
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
