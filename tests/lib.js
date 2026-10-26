// Utilidades de las pruebas: abre una pantalla de public/ en Chromium con Supabase simulado,
// la fecha fija en HOY y los datos que se le pasen.
const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')

const PUBLIC = path.join(__dirname, '..', 'public')
const STUB = fs.readFileSync(path.join(__dirname, 'stub.js'), 'utf8')
const HOY = '2026-10-21T12:00:00'
const CHROME = process.env.CHROME_PATH || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => fs.existsSync(p))

let navegador
// RECOGER=1 npm test → guarda en tests/sin-traducir.txt los textos que faltan en js/idioma-en.js
const RECOGER = process.env.RECOGER
const sinTraducir = new Set()
async function lanzar() {
  return navegador ||= await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })
}
async function cerrarNavegador() {
  if (navegador) await navegador.close()
  if (RECOGER) fs.writeFileSync(path.join(__dirname, 'sin-traducir.txt'), [...sinTraducir].sort().join('\n') + '\n')
}

async function abrir(pagina, { datos = {}, ancho = 390, alto = 844, espera = 1800, sinSesion = false, idioma = 'es' } = {}) {
  const ctx = await (await lanzar()).newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 1, locale: 'es-ES', timezoneId: 'Europe/Madrid' })
  await ctx.addInitScript(([d, hoy, sinSesion, recoger, idioma]) => {
    window.__SIN_SESION__ = sinSesion
    localStorage.setItem('idioma', idioma)
    window.__RECOGER__ = recoger
    // Fecha fija para que los resultados no cambien según el día en que se ejecuten
    const fija = new Date(hoy).getTime(), Real = Date
    class Fecha extends Real { constructor(...a) { super(...(a.length ? a : [fija])) } static now() { return fija } }
    window.Date = Fecha
    window.__DATA__ = d
    localStorage.setItem('moneda', '€')
    if (!navigator.clipboard) Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => window.__CLIP || '', writeText: async t => { window.__CLIP = t } } })
  }, [datos, HOY, sinSesion, !!RECOGER, idioma])
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url())
    if (u.hostname === 'cdn.jsdelivr.net' && u.pathname.includes('supabase')) return r.fulfill({ contentType: 'text/javascript', body: STUB })
    if (u.hostname === 'app.local') {
      const f = path.join(PUBLIC, decodeURIComponent(u.pathname))
      return fs.existsSync(f) && fs.statSync(f).isFile() && u.pathname !== '/sw.js' ? r.fulfill({ path: f }) : r.fulfill({ status: 404, body: '' })
    }
    // jsPDF (PDF de Préstamos) desde el propio proyecto, sin depender de internet
    if (u.hostname === 'cdnjs.cloudflare.com' && u.pathname.includes('jspdf')) return r.fulfill({ path: require.resolve('jspdf/dist/jspdf.umd.min.js') })
    // Fuentes y librerías externas: no hacen falta para probar
    return r.fulfill({ status: 204, body: '' })
  })
  if (RECOGER) {
    // Antes de cerrar, apunta los textos sin traducción de cada página
    const cerrar = ctx.close.bind(ctx)
    ctx.close = async () => {
      for (const p of ctx.pages()) {
        const f = await p.evaluate(() => [...(window.__FALTAN__ || [])]).catch(() => [])
        f.forEach(x => sinTraducir.add(x))
      }
      return cerrar()
    }
  }
  const pg = await ctx.newPage()
  pg.errores = []
  pg.on('pageerror', e => pg.errores.push(e.message))
  pg.on('dialog', d => d.accept())
  await pg.goto('http://app.local/' + pagina)
  await pg.waitForTimeout(espera)
  return pg
}

// Texto visible de la página, normalizado para comparar con la foto guardada
const textoVisible = pg => pg.evaluate(() => document.body.innerText.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim())

module.exports = { abrir, cerrarNavegador, textoVisible, HOY }
