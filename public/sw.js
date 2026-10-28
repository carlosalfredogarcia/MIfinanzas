// sw.js — copia local de la app para que abra rápido con mala conexión (y sin ella).
// - Páginas, JS y CSS propios: red primero, pero si tarda más de 3 s se usa la copia guardada.
//   Cada respuesta buena se guarda, así la siguiente vez abre aunque la red sea lenta.
// - Librerías del CDN con versión fija y fuentes: copia guardada primero (no cambian).
// - Supabase (datos y sesión): nunca pasa por aquí.
const CACHE = 'mifinanza-v14';
const ASSETS = ['/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.png', '/icon.svg'];
const ESPERA_RED = 3000;

self.addEventListener('install', e => {
  // skipWaiting incondicional: el nuevo SW toma control inmediatamente
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const guardar = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
  return res;
};

// Copia guardada primero; si no hay, red (y se guarda)
const copiaPrimero = req => caches.match(req).then(c => c || fetch(req).then(r => guardar(req, r)));

// Red primero con tiempo máximo; si falla o tarda, la copia guardada
function redPrimero(req, ignorarBusqueda) {
  return new Promise(resolve => {
    let hecho = false;
    const copia = () => caches.match(req, { ignoreSearch: ignorarBusqueda });
    const t = setTimeout(() => copia().then(c => { if (c && !hecho) { hecho = true; resolve(c); } }), ESPERA_RED);
    fetch(req, { cache: 'no-cache' })
      .then(r => { clearTimeout(t); guardar(req, r); if (!hecho) { hecho = true; resolve(r); } })
      .catch(() => { clearTimeout(t); copia().then(c => { if (!hecho) { hecho = true; resolve(c || Response.error()); } }); });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // Callback OAuth (Google, magic link, recuperación): el SW no debe consumir
  // la respuesta antes de que Supabase JS lea ?code= o ?error= de window.location
  if (url.search.includes('code=') || url.search.includes('error=')) return;

  // Datos y sesión: siempre directos
  if (url.hostname.includes('supabase.co') || url.pathname.startsWith('/.netlify/')) return;

  // Librerías con versión fija (supabase-js@2.118.0, xlsx, jspdf) y fuentes: no cambian
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(copiaPrimero(e.request));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com') { e.respondWith(redPrimero(e.request, false)); return; }
  if (url.origin !== self.location.origin) return;

  if (/\.(png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname)) { e.respondWith(copiaPrimero(e.request)); return; }

  // Páginas (con o sin ?accion=…), JS y CSS
  e.respondWith(redPrimero(e.request, e.request.mode === 'navigate'));
});
