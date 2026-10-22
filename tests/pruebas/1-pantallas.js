// Cada pantalla carga sin errores, sin desplazamiento lateral y muestra lo mismo que en su foto
const { completo } = require('../datos')

const PANTALLAS = ['inicio', 'mifinanza-movimientos', 'mifinanza-estadisticas-v2', 'mifinanza-fijos', 'mifinanza-metas', 'mifinanza-prestamos', 'mifinanza-perfil', 'mifinanza-viajes']

module.exports = PANTALLAS.map(p => ({
  nombre: p,
  async prueba(t) {
    for (const ancho of [360, 412]) {
      const pg = await t.abrir(p + '.html', { datos: completo(), ancho })
      t.sinErrores(pg)
      t.ok(await pg.$('.mf-bar'), 'Falta la barra de navegación')
      const w = await pg.evaluate(() => document.documentElement.scrollWidth)
      t.ok(w <= ancho, `Desplazamiento lateral a ${ancho}px (${w}px)`)
      if (ancho === 412) t.foto(p, await t.textoVisible(pg))
      await pg.context().close()
    }
  },
})).concat([{
  nombre: 'acceso (sin sesión)',
  async prueba(t) {
    const pg = await t.abrir('index.html', { sinSesion: true })
    t.sinErrores(pg)
    t.foto('acceso', await t.textoVisible(pg))
    await pg.context().close()
  },
}])
