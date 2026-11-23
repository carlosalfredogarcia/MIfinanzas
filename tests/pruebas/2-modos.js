// Vistas internas: los modos de Estadísticas y los 4 pasos de Metas
const { completo, vacio } = require('../datos')

module.exports = [
  {
    nombre: 'estadísticas: con más de 1.000 movimientos no se pierde ninguno',
    async prueba(t) {
      const d = completo()
      // 1.200 cafés antiguos: los meses recientes quedaban fuera del límite de 1.000 filas de Supabase
      for (let i = 0; i < 1200; i++) d.gastos.push({ id: 90000 + i, fecha: '2025-06-0' + (1 + i % 9), descripcion: 'Café', categoria: '☕ Café', monto: 1, usuario_id: 'u1' })
      const pg = await t.abrir('mifinanza-estadisticas-v2.html', { datos: d })
      t.contiene(await pg.$eval('.hero', e => e.innerText), 'Octubre 2026')
      t.contiene(await pg.$eval('#cats-wrap', e => e.innerText), 'Alquiler')
      await pg.click('#tab-anio'); await pg.waitForTimeout(1000)
      await pg.click('.cats-mas'); await pg.waitForTimeout(300)
      const texto = await pg.$eval('#cats-wrap', e => e.innerText)
      t.ok(/Café\s+1\.200/.test(texto), 'Faltan los 1.200 cafés: ' + texto.slice(0, 200))
      t.contiene(await pg.$eval('.cats-mas', e => e.textContent), 'Ver menos')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'estadísticas: por mes, año completo y período',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-estadisticas-v2.html', { datos: completo() })
      await pg.click('#tab-anio'); await pg.waitForTimeout(1200)
      t.foto('estadisticas-anio', await t.textoVisible(pg))
      await pg.click('#tab-periodo'); await pg.waitForTimeout(500)
      for (const m of ['Ago', 'Sep', 'Oct']) { await pg.click(`.mes-sel-chip:has-text("${m}")`); await pg.waitForTimeout(400) }
      await pg.waitForTimeout(600)
      t.foto('estadisticas-periodo', await t.textoVisible(pg))
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'metas: los 3 pasos',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: completo(), espera: 2500 })
      for (const n of [2, 3, 4]) {
        await pg.evaluate(n => irPaso(n), n); await pg.waitForTimeout(500)
        t.foto('metas-paso' + n, await t.textoVisible(pg))
      }
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'metas: seguimiento, cubrir lo pasado de un toque y deshacer',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: completo(), espera: 2500 })
      await pg.evaluate(() => irPaso(4)); await pg.waitForTimeout(600)
      const pasadas = () => pg.$$eval('.sc-pasada', e => e.length)
      const antes = await pasadas()
      t.ok(antes > 0, 'No hay categorías pasadas en los datos de prueba')
      await pg.click(antes > 1 ? '.sc-aviso-pasadas .sc-cubrir-btn' : '.sc-cubrir-btn'); await pg.waitForTimeout(700)
      t.ok(await pasadas() < antes, 'Cubrir no reparte el exceso')
      t.ok(await pg.$('#aviso-deshacer.ver'), 'No sale «Deshacer»')
      await pg.click('#aviso-deshacer button'); await pg.waitForTimeout(700)
      t.igual(await pasadas(), antes)
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'metas: tu plan con ingresos y plan categoría por categoría',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: completo(), espera: 2500 })
      // El antiguo paso «Tu dinero» lleva a «Tu plan», con el veredicto y los ingresos
      await pg.evaluate(() => irPaso(1)); await pg.waitForTimeout(500)
      t.ok(await pg.isVisible('#paso-2 #real-veredicto'), 'El resumen no está en Tu plan')
      for (const sel of ['#p-ingresos-total', '#gastos-lista-plan', '#medidor', '#tipos-ahorro', '#propuesta', '#disponible-card'])
        t.ok(!(await pg.isVisible(sel)), sel + ' sigue a la vista en Tu plan')
      // Lo que entra se cambia con el lápiz del banner, y el disponible se recalcula
      const disp = () => pg.$eval('.v-disp b', b => b.textContent)
      const dispAntes = await disp()
      await pg.click('.v-editar'); await pg.waitForTimeout(200)
      t.ok(await pg.isVisible('.v-ing-inp'), 'El lápiz no abre el campo de lo que entra')
      await pg.fill('.v-ing-inp', '5000'); await pg.press('.v-ing-inp', 'Enter'); await pg.waitForTimeout(300)
      t.igual(await pg.inputValue('#p-ingresos-total'), '5000')
      t.contiene(await pg.$eval('.v-ing', e => e.textContent), '5.000')
      t.ok((await disp()) !== dispAntes, 'El disponible no cambia con lo que entra')
      // Se guarda de verdad (antes se perdía al refrescar) y se puede restablecer
      await pg.waitForTimeout(600)
      const guardado = await pg.evaluate(() => (window.__UPS__ || []).filter(u => u.table === 'user_budget_mode').pop())
      t.igual(guardado && guardado.v.ingresos_override, 5000)
      t.contiene(await pg.$eval('.v-fila-ing', e => e.textContent), 'Ingreso')
      t.ok(await pg.isVisible('.v-reset'), 'No sale Restablecer')
      await pg.click('.v-reset'); await pg.waitForTimeout(300)
      t.igual(await pg.evaluate(() => (window.__UPS__ || []).filter(u => u.table === 'user_budget_mode').pop().v.ingresos_override), null)
      t.ok(!(await pg.isVisible('.v-reset')), 'Restablecer sigue a la vista')
      t.igual(await pg.inputValue('#p-ingresos-total'), '1380.00')
      await pg.click('.v-editar'); await pg.fill('.v-ing-inp', '5000'); await pg.press('.v-ing-inp', 'Enter'); await pg.waitForTimeout(300)
      const pct = () => pg.$eval('.pg-plan', b => parseInt(b.textContent.replace(/\D/g, '')))
      await pg.click('.btn-plan-guiado'); await pg.waitForTimeout(500)
      // Lo primero: cuánto quieres ahorrar (con lo que entra, 5.000)
      t.igual(await pg.$eval('.pg-cuenta', e => e.textContent), 'Tu ahorro')
      t.contiene(await pg.$eval('.pg-ahorro .pg-nom', e => e.textContent), '¿Cuánto quieres ahorrar')
      await pg.click('.pg-a-op[data-op="15"]'); await pg.waitForTimeout(200)
      t.contiene(await pg.$eval('.pg-a-nota', e => e.textContent), '750')
      // A tu medida: en € se convierte a %
      await pg.click('.pg-a-op[data-op="medida"]'); await pg.waitForTimeout(200)
      await pg.fill('.pg-a-eur', '1000'); await pg.waitForTimeout(200)
      t.igual(await pg.inputValue('.pg-a-pct'), '20')
      t.contiene(await pg.$eval('.pg-sig', e => e.textContent), 'categoría por categoría')
      await pg.click('.pg-sig'); await pg.waitForTimeout(500)
      t.contiene(await pg.$eval('.pg-cuenta', e => e.textContent), '1 de ')
      t.contiene(await pg.$eval('.pg-obj', e => e.textContent), 'ahorrar 20 %')
      t.contiene(await pg.$eval('.pg-hoy', e => e.textContent), '€')
      const nombre1 = await pg.$eval('.pg-nom', e => e.textContent), antes = await pct()
      await pg.click('.pg-chip:has-text("La mitad")'); await pg.waitForTimeout(300)
      t.ok(await pct() < antes, 'Bajar la categoría no baja el % de gastos')
      t.contiene(await pg.$eval('.pg-gastos', e => e.textContent), 'Tu plan')
      t.contiene(await pg.$eval('.pg-med-meta', e => e.textContent), 'no pueden pasar de')
      t.ok(await pg.$eval('.pg-plan', e => e.classList.contains('late')), 'La cifra del plan no late al cambiar')
      // El objetivo se cambia tocándolo
      await pg.click('.pg-obj'); await pg.waitForTimeout(200)
      await pg.click('.pg-meta-chips [data-pct="30"]'); await pg.waitForTimeout(200)
      t.contiene(await pg.$eval('.pg-obj', e => e.textContent), 'ahorrar 30 %')
      // Restablecer deja todo como antes, y se puede deshacer
      await pg.click('.pg-reset'); await pg.waitForTimeout(300)
      t.igual(await pct(), antes)
      await pg.click('.pg-reset:has-text("Deshacer")'); await pg.waitForTimeout(300)
      t.ok(await pct() < antes, 'Deshacer no recupera el plan')
      // El valor llega a la lista del plan
      const enLista = await pg.evaluate(n => [...document.querySelectorAll('#gastos-lista-plan .var-row')].find(r => r._planCat.includes(n)).querySelector('.variable-input').value, nombre1)
      t.igual(enLista, await pg.inputValue('.pg-inp'))
      await pg.click('.pg-sig'); await pg.waitForTimeout(500)
      t.contiene(await pg.$eval('.pg-cuenta', e => e.textContent), '2 de ')
      t.ok((await pg.$eval('.pg-nom', e => e.textContent)) !== nombre1, 'Siguiente no cambia de categoría')
      await pg.click('.pg-x'); await pg.waitForTimeout(300)
      t.ok(await pg.$eval('.pg', e => e.hidden), 'No se cierra')
      // Desde la barra de iconos se salta a una categoría
      await pg.click('.btn-plan-guiado'); await pg.waitForTimeout(400)
      await pg.click('.pg-sig'); await pg.waitForTimeout(400)
      await pg.click('.pg-saltos button >> nth=3'); await pg.waitForTimeout(400)
      t.contiene(await pg.$eval('.pg-cuenta', e => e.textContent), '4 de ')
      // Consejo sincero si se baja mucho
      await pg.click('.pg-chip:has-text("Nada")'); await pg.waitForTimeout(300)
      t.ok(await pg.$eval('.pg-aviso', e => e.classList.contains('ojo') || e.textContent === ''), 'Sin aviso al bajar a 0')
      // Terminar: sale el banner «Tu plan» en Tu plan y en Tu meta
      await pg.evaluate(() => irPlanGuiado(filasPlan().length - 1)); await pg.waitForTimeout(300)
      t.contiene(await pg.$eval('.pg-sig', e => e.textContent), 'Terminar')
      await pg.click('.pg-sig'); await pg.waitForTimeout(600)
      t.ok(await pg.isVisible('#plan-banner'), 'No sale el banner del plan')
      t.contiene(await pg.$eval('#plan-banner', e => e.textContent), 'objetivo')
      t.ok(!(await pg.isVisible('.btn-plan-guiado')), 'Sigue el botón aunque el banner ya tiene «Revisar»')
      t.ok(await pg.evaluate(() => document.getElementById('real-veredicto').compareDocumentPosition(document.getElementById('plan-banner')) & Node.DOCUMENT_POSITION_FOLLOWING), 'El banner no va segundo')
      await pg.evaluate(() => irPaso(3)); await pg.waitForTimeout(400)
      t.ok(await pg.isVisible('#plan-banner-meta'), 'No sale el banner en Tu meta')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'metas: alguien nuevo sin gastos, cómo funciona y plan con lo que cree',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: vacio(), espera: 2500 })
      await pg.evaluate(() => irPaso(2)); await pg.waitForTimeout(400)
      t.ok(await pg.isVisible('#metas-bienvenida'), 'No sale la bienvenida')
      t.contiene(await pg.$eval('#metas-bienvenida', e => e.textContent), 'Todavía no tenemos gastos tuyos')
      t.contiene(await pg.$eval('#metas-bienvenida', e => e.textContent), 'Apunta tus gastos')
      await pg.click('.mb-plan'); await pg.waitForTimeout(500)
      t.ok(await pg.isVisible('.pg-a-ing'), 'No pide lo que entra')
      t.ok(await pg.$eval('.pg-sig', b => b.disabled), 'Deja seguir sin lo que entra')
      await pg.fill('.pg-a-ing input', '1500'); await pg.waitForTimeout(200)
      await pg.click('.pg-a-op[data-op="10"]'); await pg.waitForTimeout(200)
      await pg.click('.pg-sig'); await pg.waitForTimeout(400)
      t.contiene(await pg.$eval('.pg-media', e => e.textContent), 'crees que gastas')
      t.contiene(await pg.$eval('.pg-nom', e => e.textContent), 'Alquiler')
      await pg.fill('.pg-inp', '600'); await pg.waitForTimeout(200)
      await pg.evaluate(() => irPlanGuiado(filasPlan().length - 1)); await pg.click('.pg-sig'); await pg.waitForTimeout(600)
      t.contiene(await pg.$eval('#plan-banner', e => e.textContent), 'Ahorras')
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
]
