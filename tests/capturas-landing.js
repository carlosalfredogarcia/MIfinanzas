// Capturas reales de la app para la landing (public/img/landing/), con los datos de ejemplo de datos-demo.js.
// Uso: cd tests && npm run capturas, y después pasar a .webp (más ligero):
//   cd ../public/img/landing && python3 -c "from PIL import Image;import glob,os;[(Image.open(f).convert('RGB').resize((585,1266)).save(f[:-4]+'.webp',quality=82),os.remove(f)) for f in glob.glob('*.png')]"
const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')
const { familia } = require('./datos-demo')
const PUB = path.join(__dirname, '..', 'public'), STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8')
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const OUT = path.join(PUB, 'img', 'landing')
fs.mkdirSync(OUT, { recursive: true })

const IMPORTADOS = [
  { fecha: '2026-10-02', descripcion: 'Mercadona', categoria: '🛒 Supermercado', monto: 71.2, tipo: 'gasto' },
  { fecha: '2026-10-03', descripcion: 'Pañales Dodot', categoria: '👶 Bebé', monto: 31.4, tipo: 'gasto' },
  { fecha: '2026-10-05', descripcion: 'Escuela infantil', categoria: '👶 Bebé', monto: 280, tipo: 'gasto' },
  { fecha: '2026-10-07', descripcion: 'Farmacia', categoria: '❤️ Salud', monto: 18.6, tipo: 'gasto' },
  { fecha: '2026-10-09', descripcion: 'Repsol', categoria: '⛽ Gasolina', monto: 62, tipo: 'gasto' },
]

;(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
  async function abrir(pagina) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'es-ES', timezoneId: 'Europe/Madrid' })
    await ctx.addInitScript(d => {
      window.__DATA__ = d; localStorage.setItem('moneda', '€'); localStorage.setItem('idioma', 'es')
      const f = new Date('2026-10-21T12:00:00').getTime(), R = Date
      window.Date = class extends R { constructor(...a) { super(...(a.length ? a : [f])) } static now() { return f } }
      addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '::-webkit-scrollbar{display:none}'; document.head.appendChild(s) })
    }, familia())
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url())
      if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('supabase')) return r.fulfill({ contentType: 'text/javascript', body: STUB })
      if (u.hostname === 'app.local') { const f = path.join(PUB, decodeURIComponent(u.pathname)); return fs.existsSync(f) && fs.statSync(f).isFile() && u.pathname !== '/sw.js' ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' }) }
      if (u.hostname.includes('fonts.g') || u.hostname === 'cdnjs.cloudflare.com') return r.continue()
      return r.fulfill({ status: 204, body: '' })
    })
    const pg = await ctx.newPage()
    await pg.goto('http://app.local/' + pagina); await pg.waitForTimeout(2200)
    return pg
  }
  const foto = async (pg, nombre) => { await pg.screenshot({ path: path.join(OUT, nombre + '.png') }); await pg.context().close() }

  // 1. Inicio
  await foto(await abrir('inicio.html'), 'inicio')

  // 2. Apuntar un gasto
  let pg = await abrir('inicio.html')
  await pg.click('.mf-plus'); await pg.waitForTimeout(400)
  await pg.click('.mf-acc >> nth=0'); await pg.waitForTimeout(900)
  await pg.keyboard.type('31,4'); await pg.click('.mfa-cat:has-text("Bebé")'); await pg.fill('.mfa-desc', 'Pañales'); await pg.waitForTimeout(400)
  await foto(pg, 'apuntar')

  // 3. Importar el extracto del banco (revisión antes de guardar)
  pg = await abrir('mifinanza-movimientos.html')
  await pg.evaluate(async m => { await cargarCategoriasPerfil(); abrirRevisionVoz(m) }, IMPORTADOS); await pg.waitForTimeout(900)
  await foto(pg, 'importar')

  // 4. A dónde va tu dinero
  pg = await abrir('mifinanza-estadisticas-v2.html')
  await pg.evaluate(() => { const t = [...document.querySelectorAll('h2,h3,.card-title,.sec-tit')].find(e => /dónde va/i.test(e.textContent)); (t || document.body).scrollIntoView(); scrollBy(0, -20) }); await pg.waitForTimeout(900)
  await foto(pg, 'estadisticas')

  // 5. Meta con semáforo
  pg = await abrir('mifinanza-metas.html')
  await pg.evaluate(() => irPaso(3)); await pg.waitForTimeout(900)
  await foto(pg, 'meta')

  // 6. Gastos fijos
  await foto(await abrir('mifinanza-fijos.html'), 'fijos')

  await b.close()
  console.log('Capturas en', OUT)
})()
