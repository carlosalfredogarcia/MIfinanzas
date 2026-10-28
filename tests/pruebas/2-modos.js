// Vistas internas: los modos de Estadísticas y los 4 pasos de Metas
const { completo } = require('../datos')

module.exports = [
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
    nombre: 'metas: los 4 pasos',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: completo(), espera: 2500 })
      for (const n of [1, 2, 3, 4]) {
        await pg.evaluate(n => irPaso(n), n); await pg.waitForTimeout(500)
        t.foto('metas-paso' + n, await t.textoVisible(pg))
      }
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
  {
    nombre: 'metas: la propuesta de recortes se aplica y se deshace',
    async prueba(t) {
      const pg = await t.abrir('mifinanza-metas.html', { datos: completo(), espera: 2500 })
      await pg.evaluate(() => { seleccionarPerfil('ahorrador'); irPaso(2) }); await pg.waitForTimeout(800)
      const pct = () => pg.$eval('.med-top b', b => parseInt(b.textContent))
      const antes = await pct()
      t.ok(await pg.$('#propuesta .prop-btn'), 'No hay propuesta de recortes')
      await pg.click('#propuesta .prop-btn'); await pg.waitForTimeout(400)
      t.ok(await pct() < antes, 'La propuesta no baja el gasto')
      t.contiene(await pg.$eval('#propuesta', e => e.textContent), 'Propuesta aplicada')
      await pg.click('#propuesta .prop-btn.sec'); await pg.waitForTimeout(400)
      t.igual(await pct(), antes)
      t.sinErrores(pg)
      await pg.context().close()
    },
  },
]
