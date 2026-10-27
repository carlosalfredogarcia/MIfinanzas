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
        { monto: 27.8, descripcion: 'Mercadona Alameda', fecha: '2026-10-18', tipo: 'gasto', fiable: true })
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
    nombre: 'notificación del banco con guardar=1: se guarda sola, con Deshacer',
    async prueba(t) {
      const texto = encodeURIComponent('Compra con tarjeta en MERCADONA ALAMEDA por 27,80 EUR el 18/10')
      const pg = await t.abrir('inicio.html?guardar=1&titulo=CaixaBank&texto=' + texto, { datos: completo(), espera: 3000 })
      const ins = await ultimo(pg, '__INS__')
      t.ok(ins, 'No se guardó')
      t.igual([ins.table, ins.v[0].categoria, ins.v[0].monto, ins.v[0].fecha], ['gastos', '🛒 Supermercado', 27.8, '2026-10-18'])
      t.ok(!(await pg.$('.mfa-abierto')), 'La hoja sigue abierta')
      t.contiene(await pg.$eval('.mfa-toast', e => e.textContent), 'Deshacer')
      // Un comercio que nunca se ha visto se guarda en «Otros»
      const pg2 = await t.abrir('inicio.html?guardar=1&texto=' + encodeURIComponent('Pago de 9,99 EUR en TIENDA NUEVA'), { datos: completo(), espera: 3000 })
      t.igual((await ultimo(pg2, '__INS__')).v[0].categoria, '📦 Otros')
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
  {
    nombre: 'préstamos: comprobantes opcionales y en el PDF',
    async prueba(t) {
      const fs = require('fs'), path = require('path')
      const pg = await t.abrir('mifinanza-prestamos.html', { datos: completo() })
      await pg.click('[data-id="pr1"]'); await pg.waitForTimeout(400)
      t.contiene(await pg.$eval('.linea', e => e.innerText), '📎 comprobante')
      // Abono con una foto: se reduce a JPEG y se guarda con el id del movimiento
      await pg.click('#d-abono'); await pg.waitForTimeout(400)
      await pg.keyboard.type('20')
      const png = await pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 2000; c.getContext('2d').fillRect(0, 0, 10, 10); return c.toDataURL('image/png').split(',')[1] })
      await pg.setInputFiles('#f-archivo', { name: 'bizum.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
      t.contiene(await pg.$eval('#f-comp', e => e.textContent), 'bizum.png')
      await pg.click('#f-ok'); await pg.waitForTimeout(800)
      const sub = await pg.evaluate(() => window.__SUBIDOS__.at(-1))
      t.igual([sub.path, sub.tipo], ['u1/prestamos/nuevo-1.jpg', 'image/jpeg'])
      // PDF con los comprobantes: una página más por foto
      await pg.check('#d-con-comp').catch(() => pg.click('.interruptor'))
      await pg.click('#d-pdf'); await pg.waitForTimeout(2000)
      const b64 = await pg.evaluate(async () => { const buf = new Uint8Array(await window.__ULTIMO_PDF__.arrayBuffer()); let s = ''; for (const x of buf) s += String.fromCharCode(x); return btoa(s) })
      const pdf = Buffer.from(b64, 'base64')
      fs.writeFileSync(path.join(__dirname, '..', 'capturas', 'estado-con-comprobantes.pdf'), pdf)
      const paginas = (pdf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length
      t.igual(paginas, 3, 'El PDF debería tener el estado de cuenta y 2 comprobantes')
      t.sinErrores(pg)
      await pg.context().close()
      // Sin el SQL del lunes: aviso claro en vez de error
      const pg2 = await t.abrir('mifinanza-prestamos.html', { datos: completo() })
      await pg2.evaluate(() => { window.__SIN_BUCKET__ = true })
      await pg2.click('#tab-debo'); await pg2.click('[data-id="pr3"]'); await pg2.waitForTimeout(400)
      await pg2.click('#d-abono'); await pg2.waitForTimeout(400)
      await pg2.keyboard.type('10')
      await pg2.setInputFiles('#f-archivo', { name: 'b.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') })
      await pg2.click('#f-ok'); await pg2.waitForTimeout(800)
      t.contiene(await pg2.$eval('#toast', e => e.textContent), 'aún no están activados')
      t.sinErrores(pg2)
      await pg2.context().close()
    },
  },
  {
    nombre: 'perfil: «Borrar todos mis movimientos» abre la confirmación de Movimientos',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-perfil.html', { datos: completo() })
      await pg.click('a.fila:has-text("Borrar todos mis movimientos")'); await pg.waitForTimeout(1800)
      t.ok(pg.url().endsWith('/mifinanza-movimientos.html'), 'No llegó a Movimientos: ' + pg.url())
      t.igual(await pg.$eval('#modal-borrar-1', m => m.style.display), 'flex', 'No se abrió la confirmación')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'acceso: mostrar y ocultar la contraseña, aviso amable si falta algo',
    async prueba(t) {
      const pg = await t.abrir('index.html', { sinSesion: true })
      const tipo = () => pg.$eval('#login-pass', i => i.type)
      await pg.click('#form-entrar .ojo')
      t.igual(await tipo(), 'text')
      await pg.click('#form-entrar .ojo')
      t.igual(await tipo(), 'password')
      await pg.click('#form-entrar .btn-main')
      t.igual(await pg.$eval('#error-msg', e => e.textContent), 'Escribe tu correo y tu contraseña para entrar.')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'movimientos: el lector de Excel (300 KB) solo se descarga al importar',
    async prueba(t) {
      const pedidas = []
      const pg = await t.abrir('mifinanza-movimientos.html', { datos: completo() })
      pg.on('request', r => pedidas.push(r.url()))
      await pg.waitForTimeout(500)
      t.ok(!(await pg.evaluate(() => [...document.scripts].some(s => /xlsx/.test(s.src)))), 'Movimientos carga Excel al abrirse')
      t.ok(!pedidas.some(u => /xlsx/.test(u)), 'Se pidió Excel sin importar nada')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'guía de bienvenida: sale la primera vez, se desliza y al final abre el apunte',
    async prueba(t) {
      const pg = await t.abrir('inicio.html', { datos: completo(), guia: true, espera: 2500 })
      t.ok(await pg.$('.mfg.mfg-ver'), 'No salió la guía')
      t.igual(await pg.$eval('.mfg-sig', b => b.textContent), 'Siguiente')
      for (let i = 0; i < 7; i++) { await pg.click('.mfg-sig'); await pg.waitForTimeout(450) }
      t.igual(await pg.$eval('.mfg-sig', b => b.textContent), 'Apuntar mi primer gasto')
      await pg.click('.mfg-sig'); await pg.waitForTimeout(900)
      t.ok(await pg.$('.mfa-abierto'), 'No se abrió el apunte')
      // Cerrada la guía, no queda nada invisible encima: el apunte se puede usar
      await pg.click('.mfa-cat >> nth=0', { timeout: 3000 })
      t.igual(await pg.evaluate(() => localStorage.getItem('guiaVista')), '1')
      // Vista una vez, no vuelve a salir sola; desde Perfil sí se abre
      await pg.goto('http://app.local/inicio.html'); await pg.waitForTimeout(2000)
      t.ok(!(await pg.$('.mfg.mfg-ver')), 'Volvió a salir sola')
      await pg.goto('http://app.local/mifinanza-perfil.html'); await pg.waitForTimeout(1500)
      await pg.click('#btn-guia'); await pg.waitForTimeout(500)
      t.ok(await pg.$('.mfg.mfg-ver'), 'No se abre desde Perfil')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'ayuda de Inicio: ilumina cada parte, la explica y no abre nada de debajo',
    async prueba(t) {
      const pg = await t.abrir('inicio.html', { datos: completo() })
      t.ok(!(await pg.$('script[src="js/ayuda.js"]')), 'La ayuda se descarga sin tocar «Ayuda»')
      await pg.click('[data-ayuda]'); await pg.waitForTimeout(900)
      t.ok(await pg.$('.mfh.mfh-ver'), 'No se abrió la ayuda')
      // Cada paso: el foco rodea su parte y la burbuja se ve entera sin taparla
      const PARTES = ['.period-bar', '#saldo-amount', '.spark-wrap', '.pills-row > .pill:first-child', '.pills-row > .pill:last-child', '.salud-card', '.fijos-card', '.mf-plus']
      const titulos = []
      for (const [k, sel] of PARTES.entries()) {
        const p = await pg.evaluate(sel => {
          const caja = s => document.querySelector(s).getBoundingClientRect()
          const f = caja('.mfh-foco'), e = caja(sel), b = caja('.mfh-burbuja')
          return {
            tit: document.querySelector('.mfh-tit').textContent, cuenta: document.querySelector('.mfh-cuenta').textContent,
            boton: document.querySelector('.mfh-sig').textContent,
            rodea: f.top <= e.top + 1 && f.bottom >= e.bottom - 1 && f.left <= e.left + 1 && f.right >= e.right - 1,
            burbuja: b.top >= 0 && b.bottom <= innerHeight && (b.bottom <= f.top || b.top >= f.bottom),
          }
        }, sel)
        titulos.push(p.tit)
        t.igual(p.cuenta, `${k + 1} de ${PARTES.length}`)
        t.ok(p.rodea, p.tit + ': el foco no rodea su parte')
        t.ok(p.burbuja, p.tit + ': la burbuja tapa lo iluminado o se sale de la pantalla')
        t.igual(p.boton, k === PARTES.length - 1 ? 'Entendido' : 'Siguiente')
        await pg.click('.mfh-sig'); await pg.waitForTimeout(1100)
      }
      t.igual(titulos, ['El mes que estás viendo', 'Saldo actual', 'Cómo acabó cada mes', 'Ingresos', 'Gastos', 'Salud financiera', 'Gastos fijos', 'Apunta en un momento'])
      t.ok(!(await pg.$('.mfh.mfh-ver')), '«Entendido» no cierra la ayuda')
      t.ok(!(await pg.$('.mfh-activa')), 'El botón + sigue apartado')
      // Otra vez: flechas del teclado, «Atrás», un toque fuera de la burbuja no abre la tarjeta de debajo, Esc cierra
      await pg.click('[data-ayuda]'); await pg.waitForTimeout(700)
      await pg.keyboard.press('ArrowRight'); await pg.waitForTimeout(700)
      t.igual(await pg.$eval('.mfh-tit', e => e.textContent), 'Saldo actual')
      await pg.click('.mfh-atras'); await pg.waitForTimeout(700)
      t.igual(await pg.$eval('.mfh-tit', e => e.textContent), 'El mes que estás viendo')
      await pg.mouse.click(200, 520); await pg.waitForTimeout(400)
      t.igual(new URL(pg.url()).pathname, '/inicio.html')
      t.ok(await pg.$('.mfh.mfh-ver'), 'Un toque fuera de la burbuja cerró la ayuda')
      await pg.keyboard.press('Escape'); await pg.waitForTimeout(400)
      t.ok(!(await pg.$('.mfh.mfh-ver')), 'Esc no cierra la ayuda')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
]
