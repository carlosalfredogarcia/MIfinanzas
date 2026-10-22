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
  {
    nombre: 'botón +: cada opción abre su hoja',
    async prueba(t) {
      for (const pagina of ['inicio.html', 'mifinanza-movimientos.html', 'mifinanza-estadisticas-v2.html']) {
        const pg = await t.abrir(pagina, { datos: completo() })
        const url = pg.url()
        await pg.click('.mf-plus'); await pg.waitForTimeout(300)
        await pg.click('.mf-acc:has-text("Ingreso")'); await pg.waitForTimeout(800)
        t.igual(pg.url(), url, `${pagina}: Ingreso cambió de página`)
        t.igual(await pg.$eval('#mfa-tit', e => e.textContent), 'Nuevo ingreso')
        await pg.click('.mfa-x'); await pg.waitForTimeout(300)
        // Gasto fijo: va a Gastos fijos y abre su hoja
        await pg.click('.mf-plus'); await pg.waitForTimeout(300)
        await pg.click('.mf-acc:has-text("Gasto fijo")'); await pg.waitForTimeout(2500)
        t.ok(pg.url().endsWith('/mifinanza-fijos.html'), `${pagina}: Gasto fijo no llevó a Gastos fijos (${pg.url()})`)
        t.ok(await pg.$('#hoja-raiz.h-abierta'), `${pagina}: no se abrió la hoja de gasto fijo`)
        t.sinErrores(pg)
        await pg.context().close()
      }
      const pg = await t.abrir('mifinanza-movimientos.html', { datos: completo() })
      await pg.click('.mf-plus'); await pg.waitForTimeout(300)
      await pg.click('.mf-acc:has-text("Importar CSV")'); await pg.waitForTimeout(600)
      t.ok(await pg.$eval('#modal-csv', e => getComputedStyle(e).display !== 'none'), 'Importar CSV no abre')
      await pg.context().close()
    },
  },
  {
    nombre: 'ingreso rápido: nómina repetida con un toque',
    async prueba(t) {
      const pg = await t.abrir('inicio.html', { datos: completo() })
      await pg.evaluate(() => mfApunte.abrir('ingreso')); await pg.waitForTimeout(800)
      t.igual(await pg.$$eval('.mfa-cat', els => els.map(e => e.innerText.replace(/\n/g, ' '))), ['💼 Nómina', '💵 Efectivo', '⭐ Extra', '📦 Otro'])
      await pg.click('.mfa-rec:has-text("Nómina")'); await pg.waitForTimeout(200)
      await pg.click('.mfa-guardar'); await pg.waitForTimeout(500)
      const ins = await pg.evaluate(() => window.__INS__.at(-1))
      t.igual(ins.table, 'ingresos')
      t.igual({ ...ins.v[0] }, { fecha: '2026-10-21', concepto: 'Nómina', tipo: '💼 Nómina', monto: 1380, usuario_id: 'u1', origen: 'manual' })
      await pg.click('.mfa-toast button'); await pg.waitForTimeout(300)
      t.igual(await pg.evaluate(() => window.__DEL__.at(-1)), 'ingresos')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'abrir con un mensaje del banco en la dirección (compartir, atajos)',
    async prueba(t) {
      const texto = encodeURIComponent('Compra con tarjeta en MERCADONA ALAMEDA por 27,80 EUR el 18/10')
      const pg = await t.abrir('inicio.html?texto=' + texto, { datos: completo(), espera: 2500 })
      t.ok(await pg.$('.mfa-abierto'), 'No se abrió el apunte')
      t.igual(await pg.evaluate(() => [document.getElementById('mfa-importe').value, document.getElementById('mfa-desc').value, document.querySelector('[data-otra]').textContent]),
        ['27,80', 'Mercadona Alameda', '📅 18 oct'])
      t.igual(await pg.$eval('.mfa-cat[aria-pressed="true"]', e => e.innerText.replace(/\n/g, ' ')), '🛒 Supermercado')
      t.ok(!pg.url().includes('texto='), 'La dirección no se limpió')
      const pg2 = await t.abrir('mifinanza-movimientos.html?accion=gasto&importe=4,5&comercio=Starbucks', { datos: completo(), espera: 2500 })
      t.igual(await pg2.evaluate(() => [document.getElementById('mfa-importe').value, document.getElementById('mfa-desc').value]), ['4,50', 'Starbucks'])
      t.sinErrores(pg); t.sinErrores(pg2)
      await pg.context().close(); await pg2.context().close()
    },
  },
  {
    nombre: 'préstamos: abono, saldar y estado de cuenta en PDF',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-prestamos.html', { datos: completo() })
      const texto = await t.textoVisible(pg)
      t.contiene(texto, 'TE DEBEN\n400 €'.replace(' €', '\u00a0€'))
      // Abono de todo lo pendiente: queda saldado (con Deshacer)
      await pg.click('[data-id="pr1"]'); await pg.waitForTimeout(400)
      await pg.click('#d-abono'); await pg.waitForTimeout(400)
      await pg.click('#f-todo button')
      t.igual(await pg.$eval('#f-monto', e => e.value), '400')
      await pg.click('#f-ok'); await pg.waitForTimeout(600)
      const ins = await pg.evaluate(() => window.__INS__.at(-1))
      t.igual(ins.table, 'prestamos_pagos'); t.igual(ins.v[0].tipo, 'abono'); t.igual(ins.v[0].monto, 400)
      t.igual((await pg.evaluate(() => window.__UPD__.at(-1))).v, { activo: false })
      t.contiene(await pg.$eval('#toast', e => e.textContent), 'Juan ya no te debe nada')
      // PDF: se genera en el móvil y lleva los movimientos con su saldo
      await pg.click('#d-pdf'); await pg.waitForTimeout(1500)
      const b64 = await pg.evaluate(async () => { const b = window.__ULTIMO_PDF__; if (!b) return null; const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s) })
      t.ok(b64, 'No se generó el PDF')
      const fs = require('fs'), path = require('path')
      fs.mkdirSync(path.join(__dirname, '..', 'capturas'), { recursive: true })
      fs.writeFileSync(path.join(__dirname, '..', 'capturas', 'estado-de-cuenta.pdf'), Buffer.from(b64, 'base64'))
      t.ok(Buffer.from(b64, 'base64').slice(0, 5).toString() === '%PDF-', 'No es un PDF')
      // Resumen por WhatsApp
      const resumen = await pg.evaluate(() => textoResumen(prestamos.find(p => p.id === 'pr3')))
      t.contiene(resumen, 'Te paso cómo voy con lo que te debo')
      t.contiene(resumen, 'Pendiente: *200\u00a0€*')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
]
