const CACHE = 'mifinanza-v3';
const PRECACHE = [
  '/',
  '/index.html',
  '/mifinanza-movimientos.html',
  '/mifinanza-fijos.html',
  '/mifinanza-metas.html',
  '/mifinanza-estadisticas-v2.html',
  '/mifinanza-perfil.html',
  '/login.html',
  '/auth.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
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
  // Supabase y CDN siempre en red
  if (url.hostname.includes('supabase') || url.hostname.includes('jsdelivr') || url.hostname.includes('googleapis')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }))
  );
});
