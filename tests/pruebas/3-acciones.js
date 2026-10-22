// Lo que hace el usuario: apuntar un gasto, crear un fijo, renombrar una categoría,
// importar el banco sin duplicar fijos y buscar o borrar en Movimientos
const { completo } = require('../datos')
const ultimo = (pg, que) => pg.evaluate(q => (window[q] || []).at(-1), que)

module.exports = [
  {
    nombre: 'apunte rápido desde otra pantalla: guardar y deshacer',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-estadisticas-v2.html', { datos: completo() })
      const url = pg.url()
      await pg.click('.mf-plus'); await pg.waitForTimeout(300)
      await pg.click('.mf-acc:has-text("Gasto"):not(:has-text("fijo"))'); await pg.waitForTimeout(800)
      t.igual(pg.url(), url, 'Cambió de página')
      t.igual(await pg.evaluate(() => document.activeElement.id), 'mfa-importe', 'El foco no está en el importe')
      await pg.keyboard.type('12,5')
      await pg.click('.mfa-cat:has-text("Salidas")')
      t.igual(await pg.$eval('.mfa-guardar', b => b.textContent), 'Guardar 12,50\u00a0€')
      await pg.click('.mfa-guardar'); await pg.waitForTimeout(500)
      const ins = await ultimo(pg, '__INS__')
      t.igual(ins.table, 'gastos')
      t.igual({ ...ins.v[0], usuario_id: undefined }, { fecha: '2026-10-21', descripcion: 'Salidas', categoria: '🎉 Salidas', monto: 12.5, usuario_id: undefined, origen: 'manual' })
      await pg.click('.mfa-toast button'); await pg.waitForTimeout(300)
      t.igual(await ultimo(pg, '__DEL__'), 'gastos', 'Deshacer no borró el gasto')
      // Repetir un gasto reciente rellena todo
      await pg.click('.mf-plus'); await pg.waitForTimeout(300)
      await pg.click('.mf-acc:has-text("Gasto"):not(:has-text("fijo"))'); await pg.waitForTimeout(800)
      await pg.click('.mfa-rec:has-text("Vzla")'); await pg.waitForTimeout(200)
      t.igual(await pg.evaluate(() => [document.getElementById('mfa-importe').value, document.getElementById('mfa-desc').value]), ['211', 'Vzla'])
      // Un mensaje del banco se lee sin IA
      t.igual(await pg.evaluate(() => mfApunte.leerMensajeBanco('Compra con tarjeta en MERCADONA ALAMEDA por 27,80 EUR el 18/10')),
        { monto: 27.8, descripcion: 'Mercadona Alameda', fecha: '2026-10-18' })
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'gastos fijos: avisos, crear y dejar de pagar',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-fijos.html', { datos: completo() })
      const texto = await t.textoVisible(pg)
      t.contiene(texto, 'Se cuentan dos veces')
      t.contiene(texto, '¿«Netflix.com» es un gasto fijo?')
      await pg.evaluate(() => abrirModal()); await pg.waitForTimeout(400)
      await pg.keyboard.type('39,9')
      await pg.fill('#h-nombre', 'Digi fibra')
      await pg.click('#h-cats .cat[data-mas]'); await pg.click('#h-cats .cat:has-text("Internet")')
      await pg.click('#h-guardar'); await pg.waitForTimeout(300)
      const ins = await ultimo(pg, '__INS__')
      t.igual(ins.v[0].monto, 39.9); t.igual(ins.v[0].fecha_inicio, '2026-10-21'); t.igual(ins.v[0].categoria, '🌐 Internet')
      await pg.click('.fila[data-editar="f2"]'); await pg.waitForTimeout(400)
      await pg.click('[data-fin="este"]'); await pg.waitForTimeout(300)
      t.igual((await ultimo(pg, '__UPD__')).v, { activo: false, fecha_fin: '2026-10-21' })
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'perfil: renombrar una categoría cambia todas las tablas',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-perfil.html', { datos: completo() })
      await pg.click('[data-cat="🎉 Salidas"]'); await pg.waitForTimeout(300)
      await pg.click('#o-renombrar'); await pg.waitForTimeout(300)
      await pg.fill('#f-nombre', 'Ocio'); await pg.click('#f-emojis button[aria-label="🎬"]')
      await pg.click('#f-ok'); await pg.waitForTimeout(500)
      const tablas = await pg.evaluate(() => window.__UPD__.slice(-6).map(u => u.table))
      t.igual(tablas, ['gastos', 'gastos_fijos', 'ingresos', 'user_gasto_plan', 'categoria_tipo', 'perfil'])
      t.contiene((await ultimo(pg, '__UPD__')).v.categorias, '🎬 Ocio')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'importar el banco no guarda lo que ya cuenta un fijo',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-movimientos.html', { datos: completo() })
      await pg.evaluate(() => abrirRevisionVoz([
        { fecha: '2026-08-01', descripcion: 'TRANSF ALQUILER PISO', categoria: '🏠 Alquiler', monto: 418, tipo: 'gasto' },
        { fecha: '2026-09-15', descripcion: 'Mercadona', categoria: '🛒 Supermercado', monto: 418, tipo: 'gasto' },
        { fecha: '2026-09-01', descripcion: 'Nómina', categoria: '💼 Nómina', monto: 1380, tipo: 'ingreso' }]))
      await pg.waitForTimeout(800)
      t.igual(await pg.$$eval('#revision-voz-lista .revision-item', els => els.map(e => !!e.dataset.fijo)), [true, false, false])
      await pg.evaluate(() => guardarRevisionVoz()); await pg.waitForTimeout(500)
      const guardados = await pg.evaluate(() => window.__INS__.flatMap(x => x.v.map(v => v.descripcion || v.concepto)))
      t.igual(guardados, ['Mercadona', 'Nómina'])
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'movimientos: buscar, filtrar y borrar con deshacer',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-movimientos.html', { datos: completo() })
      const filas = () => pg.evaluate(() => document.querySelectorAll('.fila').length)
      const total = await filas()
      await pg.fill('#buscar', 'merca'); await pg.waitForTimeout(200)
      // Busca también en la categoría: «merca» encuentra todo Supermercado
      t.igual(await pg.evaluate(() => [...document.querySelectorAll('.mov-desc')].map(e => e.textContent)), ['Mercadona', 'Carrefour', 'Mercadona'])
      await pg.click('#buscar-limpiar')
      await pg.click('.filtro-chip:has-text("Fijos")'); await pg.waitForTimeout(200)
      t.ok((await filas()) >= 3, 'Faltan los fijos')
      await pg.click('.filtro-chip:has-text("Todos")'); await pg.waitForTimeout(200)
      t.igual(await filas(), total)
      await pg.evaluate(() => { const b = document.querySelector('.fila .acc-borrar'); b.click() }); await pg.waitForTimeout(400)
      t.igual(await filas(), total - 1)
      await pg.click('#deshacer button'); await pg.waitForTimeout(300)
      t.igual(await filas(), total)
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
]
