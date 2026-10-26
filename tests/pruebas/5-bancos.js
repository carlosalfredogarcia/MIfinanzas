// Avisos de distintos bancos y apps de pago: la app saca importe, comercio y tipo, y solo guarda sola lo que es seguro
const { completo } = require('../datos')

// [título del aviso, texto, lo que debe salir]
const CASOS = [
  ['Santander', 'Compra con tarjeta en MERCADONA ALAMEDA por 27,80 EUR el 18/10', { monto: 27.8, descripcion: 'Mercadona Alameda', tipo: 'gasto', fiable: true }],
  ['Santander', 'Has realizado una compra de 23,45 EUR en LIDL con tu tarjeta terminada en 1234', { monto: 23.45, descripcion: 'Lidl', tipo: 'gasto', fiable: true }],
  ['BBVA', 'Compra de 12,50 € en REPSOL ESTACION 4521', { monto: 12.5, descripcion: 'Repsol Estacion', tipo: 'gasto', fiable: true }],
  ['CaixaBank', 'Compra en ZARA, con tarjeta ****1234, por 39,95 EUR', { monto: 39.95, descripcion: 'Zara', tipo: 'gasto', fiable: true }],
  ['ING', 'Pago con tarjeta: AMAZON*MKT EU 18,99 €', { monto: 18.99, descripcion: 'Amazon Mkt Eu', tipo: 'gasto', fiable: true }],
  ['Revolut', '€23.45 at Mercadona', { monto: 23.45, descripcion: 'Mercadona', tipo: 'gasto', fiable: true }],
  ['Mercadona', '23,45 € con Visa ••1234', { monto: 23.45, descripcion: 'Mercadona', tipo: 'gasto', fiable: true }],
  ['Bizum', 'Has enviado un Bizum de 15,00 € a Laura', { monto: 15, descripcion: 'Bizum a Laura', tipo: 'gasto', fiable: true }],
  ['Santander', 'Bizum recibido de Ana Pérez por 20,00 €', { monto: 20, descripcion: 'Bizum de Ana Pérez', tipo: 'ingreso', fiable: true }],
  ['Sabadell', 'Has recibido una transferencia de EMPRESA SL de 1.380,00 EUR', { monto: 1380, tipo: 'ingreso', fiable: true }],
  ['BBVA', 'Retirada en cajero de 50,00 €', { monto: 50, descripcion: 'Cajero', tipo: 'gasto', fiable: true }],
  ['Santander', 'Tu código de verificación para la compra de 59,90 EUR en AMAZON es 482913', { fiable: false }],
  ['BBVA', 'Operación denegada: compra de 30,00 € en IKEA', { fiable: false }],
  ['ING', 'Tu saldo es 1.234,56 €', { fiable: false }],
]

module.exports = [{
  nombre: 'bancos: avisos de distintos bancos se leen bien',
  async prueba(t) {
    const pg = await t.abrir('inicio.html', { datos: completo() })
    for (const [titulo, texto, esperado] of CASOS) {
      const r = await pg.evaluate(([x, y]) => mfApunte.leerMensajeBanco(x, y), [texto, titulo])
      for (const k in esperado) t.igual(r[k], esperado[k], `«${texto}» → ${k}`)
    }
    // Un Bizum recibido se guarda solo como ingreso
    const pg2 = await t.abrir('inicio.html?guardar=1&titulo=Santander&texto=' + encodeURIComponent('Bizum recibido de Ana por 20,00 €'), { datos: completo(), espera: 3000 })
    const ins = await pg2.evaluate(() => (window.__INS__ || []).at(-1))
    t.igual([ins.table, ins.v[0].monto], ['ingresos', 20])
    // Un código de verificación no se guarda
    const pg3 = await t.abrir('inicio.html?guardar=1&titulo=Santander&texto=' + encodeURIComponent('Tu código para la compra de 59,90 EUR en AMAZON es 482913'), { datos: completo(), espera: 3000 })
    t.igual(await pg3.evaluate(() => (window.__INS__ || []).length), 0, 'Guardó un código de verificación')
    t.sinErrores(pg); t.sinErrores(pg2); t.sinErrores(pg3)
    await pg.context().close(); await pg2.context().close(); await pg3.context().close()
  },
}]
