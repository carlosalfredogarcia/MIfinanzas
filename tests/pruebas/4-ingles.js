// La app en inglés (js/idioma.js): todo traducido y los datos se guardan igual que en español
const { completo } = require('../datos')
const ultimo = (pg, que) => pg.evaluate(q => (window[q] || []).at(-1), que)

// Lo único que puede quedar sin traducir son los datos de prueba que escribe el usuario
const DATOS_USUARIO = new Set(['Basic Fit', 'Carlos', 'Carrefour', 'Corte de pelo', 'Digi fibra', 'Juan', 'María', 'Mercadona', 'Multa',
  'NETFLIX.COM', 'Netflix.com', 'Pedro', 'Préstamo coche', 'Salida con amigos', 'Seguro hogar', 'Spotify', 'Transf alquiler piso',
  'Viaje a Japón', 'Vzla', 'prueba@correo.com', 'b.png', 'bizum.png'])

const PANTALLAS = ['inicio', 'mifinanza-movimientos', 'mifinanza-estadisticas-v2', 'mifinanza-fijos', 'mifinanza-metas', 'mifinanza-prestamos', 'mifinanza-perfil', 'mifinanza-viajes']

module.exports = [
  {
    nombre: 'inglés: ninguna pantalla deja textos en español',
    async prueba(t) {
      for (const p of PANTALLAS.concat('index')) {
        const pg = await t.abrir(p + '.html', { datos: completo(), idioma: 'en', sinSesion: p === 'index' })
        t.sinErrores(pg)
        const w = await pg.evaluate(() => document.documentElement.scrollWidth)
        t.ok(w <= 390, `${p}: desplazamiento lateral (${w}px)`)
        const faltan = (await pg.evaluate(() => [...window.__FALTAN__])).filter(x => !DATOS_USUARIO.has(x.replace(/^\P{L}+/u, '')))
        t.igual(faltan, [], p + ': textos sin traducir')
        await pg.context().close()
      }
    },
  },
  {
    nombre: 'inglés: un gasto se guarda con la categoría en español',
    async prueba(t) {
      const pg = await t.abrir('inicio.html', { datos: completo(), idioma: 'en' })
      t.contiene(await t.textoVisible(pg), 'Hi, Carlos')
      await pg.click('.mf-plus'); await pg.waitForTimeout(300)
      await pg.click('.mf-acc:has-text("Expense"):not(:has-text("Fixed"))'); await pg.waitForTimeout(800)
      await pg.keyboard.type('12.5')
      await pg.click('.mfa-cat:has-text("Going out")')
      t.igual(await pg.$eval('.mfa-guardar', b => b.textContent), 'Save €12.50')
      await pg.click('.mfa-guardar'); await pg.waitForTimeout(500)
      const ins = await ultimo(pg, '__INS__')
      t.igual([ins.table, ins.v[0].categoria, ins.v[0].monto], ['gastos', '🎉 Salidas', 12.5])
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'inglés: los desplegables guardan el valor en español',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-movimientos.html', { datos: completo(), idioma: 'en' })
      const opciones = await pg.$$eval('select option', os => os.filter(o => o.textContent.includes('Rent')).map(o => o.value))
      t.ok(opciones.length > 0, 'No hay desplegable con Rent')
      t.ok(opciones.every(v => v === '🏠 Alquiler'), 'Valor traducido: ' + opciones.join(', '))
      await pg.context().close()
    },
  },
]
