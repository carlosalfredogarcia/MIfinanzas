// Vídeo demo de MiFinanza: recorre la app con datos de ejemplo, subtítulos y toques visibles.
// Uso: cd tests && npm run video [-- <carpeta-salida>]   (por defecto tests/video/)
// Deja el .webm grabado, extracto-banco.csv (el extracto de ejemplo) y escenas.txt (segundo en que empieza
// cada escena, aproximado: el vídeo se alarga unos segundos; ajustar al montar la voz). Convertir a mp4: ffmpeg -i <video>.webm -c:v libx264 -pix_fmt yuv420p demo.mp4
const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')
const PUB = path.join(__dirname, '..', 'public'), STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8')
const { familia } = require('./datos-demo')
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'video')), IDIOMA = process.argv[3] || 'es'
// Datos de ejemplo de una familia con bebé (los mismos que las capturas de la landing)
const DATOS = familia()
fs.mkdirSync(OUT, { recursive: true })
const marcas = []  // [segundo, escena] para sincronizar luego la voz

// Respuesta de ejemplo de la importación (no se llama a la IA)
const IMPORTADOS = [
  { fecha: '2026-10-02', descripcion: 'Mercadona', categoria: '🛒 Supermercado', monto: 54.3, tipo: 'gasto' },
  { fecha: '2026-10-04', descripcion: 'Repsol', categoria: '⛽ Gasolina', monto: 48, tipo: 'gasto' },
  { fecha: '2026-10-06', descripcion: 'Netflix', categoria: '📺 Suscripción', monto: 12.99, tipo: 'gasto' },
  { fecha: '2026-10-09', descripcion: 'Farmacia', categoria: '❤️ Salud', monto: 18.4, tipo: 'gasto' },
  { fecha: '2026-10-11', descripcion: 'Cena con amigos', categoria: '🎉 Salidas', monto: 36.5, tipo: 'gasto' },
  { fecha: '2026-10-14', descripcion: 'Zara', categoria: '👕 Ropa', monto: 39.95, tipo: 'gasto' },
  { fecha: '2026-10-15', descripcion: 'Bizum de Laura', categoria: '⭐ Extra', monto: 25, tipo: 'ingreso' },
]
const CSV = 'Fecha;Concepto;Importe\n' + IMPORTADOS.map(m => `${m.fecha.split('-').reverse().join('/')};${m.descripcion.toUpperCase()};${m.tipo === 'gasto' ? '-' : ''}${String(m.monto).replace('.', ',')}`).join('\n')
fs.writeFileSync(path.join(OUT, 'extracto-banco.csv'), CSV)

;(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid',
    recordVideo: { dir: OUT, size: { width: 780, height: 1688 } } })
  const inicio = Date.now()
  const marca = e => marcas.push([((Date.now() - inicio) / 1000).toFixed(1), e])
  await ctx.addInitScript(([d, idioma]) => {
    window.__DATA__ = d
    window.__SIN_SESION__ = location.pathname.endsWith('index.html')
    localStorage.setItem('moneda', '€'); localStorage.setItem('guiaVista', '1'); if (!sessionStorage.getItem('demo')) { localStorage.setItem('idioma', idioma); sessionStorage.setItem('demo', '1') }
    const f = new Date('2026-10-21T12:00:00').getTime(), R = Date
    window.Date = class extends R { constructor(...a) { super(...(a.length ? a : [f])) } static now() { return f } }
    addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style')
      st.textContent = `
        #demo-cap { position: fixed; z-index: 99999; left: 14px; right: 14px; top: 14px; padding: 12px 16px; border-radius: 18px;
          background: rgba(10,14,26,.78); border: 1px solid rgba(255,255,255,.14); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          color: #fff; font: 800 16px/1.3 Manrope, system-ui, sans-serif; text-align: center; box-shadow: 0 14px 30px rgba(0,0,0,.5);
          opacity: 0; transform: translateY(-10px); transition: opacity .35s, transform .35s; pointer-events: none }
        #demo-cap.ver { opacity: 1; transform: none }
        #demo-cap small { display: block; margin-top: 3px; font-weight: 600; font-size: 13px; color: #a7f3d0 }
        .demo-toque { position: fixed; z-index: 99998; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%;
          background: rgba(255,255,255,.35); border: 2px solid rgba(255,255,255,.8); pointer-events: none; animation: demo-t .55s ease-out forwards }
        @keyframes demo-t { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.3); opacity: 0 } }
        ::-webkit-scrollbar { display: none }`
      document.head.appendChild(st)
      const c = document.createElement('div'); c.id = 'demo-cap'; document.body.appendChild(c)
    })
    addEventListener('pointerdown', e => {
      const t = document.createElement('div'); t.className = 'demo-toque'
      t.style.left = e.clientX + 'px'; t.style.top = e.clientY + 'px'
      document.body.appendChild(t); setTimeout(() => t.remove(), 600)
    }, true)
    window.__cap = (txt, sub) => { const c = document.getElementById('demo-cap'); if (!c) return
      if (!txt) { c.classList.remove('ver'); return }
      c.innerHTML = txt + (sub ? `<small>${sub}</small>` : ''); c.classList.add('ver') }
  }, [DATOS, IDIOMA])
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url())
    if (u.pathname.includes('import-csv')) return setTimeout(() => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ movimientos: IMPORTADOS }) }), 1800)
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('supabase')) return r.fulfill({ contentType: 'text/javascript', body: STUB })
    if (u.hostname === 'app.local') { const f = path.join(PUB, decodeURIComponent(u.pathname)); return fs.existsSync(f) && fs.statSync(f).isFile() && u.pathname !== '/sw.js' ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' }) }
    if (u.hostname.includes('fonts.g') || u.hostname === 'cdnjs.cloudflare.com') return r.continue()
    return r.fulfill({ status: 204, body: '' })
  })
  const pg = await ctx.newPage()
  const espera = ms => pg.waitForTimeout(ms)
  const cap = async (t, s) => { await pg.evaluate(([t, s]) => window.__cap(t, s), [t, s]) }
  const ir = async p => { await pg.goto('http://app.local/' + p); await espera(1300) }
  const toca = async (sel, ms = 700) => { const el = pg.locator(sel).filter({ visible: true }).first(); await el.scrollIntoViewIfNeeded(); const bx = await el.boundingBox(); await pg.mouse.move(bx.x + bx.width / 2, bx.y + bx.height / 2, { steps: 8 }); await el.click(); await espera(ms) }
  const baja = async (px, ms = 1400) => { await pg.evaluate(px => window.scrollBy({ top: px, behavior: 'smooth' }), px); await espera(ms) }
  const arriba = async () => { await pg.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await espera(700) }

  // 1. Acceso
  marca('acceso'); await ir('index.html'); await espera(1500)
  await cap('MiFinanza', 'Tu dinero, bajo control'); await espera(1500)
  await toca('#login-email', 200); await pg.keyboard.type('lucia@correo.com', { delay: 45 })
  await toca('#login-pass', 200); await pg.keyboard.type('••••••••'.replace(/•/g, 'a'), { delay: 45 })
  await toca('#form-entrar .btn-main', 200); await pg.evaluate(() => mostrarCarga('Cargando tu cuenta...', '')); await espera(1100)

  // 2. Inicio
  marca('inicio'); await ir('inicio.html')
  await cap('Todo tu mes de un vistazo', 'Saldo, ingresos y gastos'); await espera(2600)
  await baja(560); await cap('¿Vas bien este mes?', 'Tu salud financiera, en un solo número'); await espera(2600)
  await baja(560); await cap('Tus gastos fijos', 'Se cuentan solos cada mes'); await espera(2200)
  await arriba()

  // 3. Apuntar un gasto
  marca('apuntar'); await cap('Apunta un gasto en segundos'); await espera(900)
  await toca('.mf-plus', 600); await toca('.mf-acc >> nth=0', 900)
  await pg.keyboard.type('12,5', { delay: 160 }); await espera(300)
  await toca('.mfa-cat >> nth=0', 500)
  await toca('.mfa-desc', 200); await pg.keyboard.type('Panadería', { delay: 60 }); await espera(500)
  await toca('.mfa-guardar', 1600)
  await cap('Guardado. Y si te equivocas: «Deshacer»'); await espera(1800)

  // 4. Importar el extracto del banco
  marca('importar'); await ir('mifinanza-movimientos.html')
  await cap('Importa el extracto de tu banco', 'CSV, XLS o XLSX'); await espera(1500)
  await toca('.mf-plus', 600); await toca('.mf-acc:has-text("CSV")', 900)
  await pg.setInputFiles('#csv-file', path.join(OUT, 'extracto-banco.csv'))
  await cap('La app lee y clasifica cada movimiento', 'Tú solo revisas'); await espera(3200)
  await baja(380, 1500); await baja(-380, 900)
  await cap('Revisa las categorías y guarda'); await espera(1200)
  await toca('button:has-text("Guardar todos"), button:has-text("Guardar")', 1800)

  // 5. Movimientos: buscar y filtrar
  marca('movimientos'); await ir('mifinanza-movimientos.html')
  await cap('Todos tus movimientos', 'Busca y filtra en un momento'); await espera(1600)
  await baja(420, 1200)
  await toca('#buscar', 200); await pg.keyboard.type('merca', { delay: 110 }); await espera(1600)
  await toca('#buscar-limpiar', 500); await toca('.filtro-chip:has-text("Fijos")', 1500); await toca('.filtro-chip:has-text("Todos")', 600)

  // 6. Estadísticas
  marca('estadisticas'); await ir('mifinanza-estadisticas-v2.html')
  await cap('¿A dónde va tu dinero?', 'Por mes, por período o el año entero'); await espera(2200)
  await baja(620, 2600); await baja(600, 2200)
  await arriba(); await toca('button:has-text("Año completo"), [role=tab]:has-text("Año completo")', 2200)

  // 7. Metas
  marca('metas'); await ir('mifinanza-metas.html')
  await toca('button:has-text("Tu dinero")', 900)
  await cap('Metas en 4 pasos', '1 · Entiende tu dinero real'); await espera(2200)
  await baja(500, 1600); await arriba()
  await toca('button:has-text("Tu plan")', 1000); await cap('2 · Haz tu plan mensual'); await espera(1400); await baja(500, 1600); await arriba()
  await toca('button:has-text("Tu meta")', 1000); await cap('3 · Ponte una meta realista', 'El semáforo te dice si llegas'); await espera(2400); await arriba()
  await toca('button:has-text("Seguimiento")', 1000); await cap('4 · Sigue tu mes', 'Lo que te queda para cada día'); await espera(2600)

  // 8. Gastos fijos
  marca('fijos'); await ir('mifinanza-fijos.html')
  await cap('Gastos fijos', 'Próximos cobros y avisos de duplicados'); await espera(2400); await baja(600, 2000)

  // 9. Préstamos
  marca('prestamos'); await ir('mifinanza-prestamos.html')
  await cap('Préstamos', 'Lo que prestas y lo que debes, siempre claro'); await espera(2600)

  // 10. Perfil e idioma
  marca('perfil'); await ir('mifinanza-perfil.html')
  await cap('Tu perfil, tus categorías', 'Y también en inglés'); await espera(1500)
  await toca('[data-idioma="en"]', 2200); await cap('Also in English 🇬🇧'); await espera(1200); await baja(700, 1800)
  await pg.evaluate(() => localStorage.setItem('idioma', 'es'))

  // 11. Cierre
  marca('cierre'); await ir('index.html'); await espera(500)
  await pg.evaluate(() => { document.querySelector('.cristal').style.display = 'none'; document.querySelector('.idioma').style.display = 'none' })
  await cap('Pruébala gratis', 'Tu dinero, bajo control'); await espera(4000)

  await ctx.close(); await b.close()
  fs.writeFileSync(path.join(OUT, 'escenas.txt'), marcas.map(m => m.join('\t')).join('\n') + '\n')
})()
