// Datos de ejemplo para el marketing (capturas de la landing y vídeo demo): una familia joven con un bebé.
// No son de nadie. Misma forma que datos.js; la fecha de referencia es también el 21 de octubre de 2026.
const pad = n => String(n).padStart(2, '0')
const gastos = [], ingresos = []
let id = 1
const gasto = (m, d, descripcion, categoria, monto, origen = 'manual') =>
  gastos.push({ id: id++, fecha: `2026-${pad(m)}-${pad(d)}`, descripcion, categoria, monto, origen, usuario_id: 'u1' })

const salidas = [45, 30, 62, 80, 55, 96, 120, 140, 70, 48]
const ropa = [0, 0, 39.9, 0, 64.5, 0, 0, 45, 89.9, 0]
for (let m = 1; m <= 10; m++) {
  const hasta = d => m < 10 || d <= 21
  ingresos.push({ id: 'i' + m, fecha: `2026-${pad(m)}-01`, monto: 1650, concepto: 'Nómina Lucía', tipo: '💼 Nómina', origen: 'manual', usuario_id: 'u1' })
  ingresos.push({ id: 'j' + m, fecha: `2026-${pad(m)}-02`, monto: m === 6 ? 1650 : 1100, concepto: 'Nómina Dani', tipo: '💼 Nómina', origen: 'manual', usuario_id: 'u1' })
  ;[4, 11, 18, 25].forEach((d, k) => { if (hasta(d)) gasto(m, d, k % 2 ? 'Lidl' : 'Mercadona', '🛒 Supermercado', 84 + (m * 7 + k * 11) % 30) })
  ;[6, 20].forEach(d => { if (hasta(d)) gasto(m, d, 'Pañales y toallitas', '👶 Bebé', 31.4) })
  if (hasta(9)) gasto(m, 9, 'Leche infantil', '👶 Bebé', 27.95)
  if (hasta(14)) gasto(m, 14, 'Farmacia', '❤️ Salud', 12 + (m * 5) % 19)
  if (hasta(16)) gasto(m, 16, 'Repsol', '⛽ Gasolina', 55 + (m * 9) % 25)
  if (salidas[m - 1] && hasta(13)) gasto(m, 13, m % 2 ? 'Cena con amigos' : 'Paseo y helados', '🎉 Salidas', salidas[m - 1])
  if (ropa[m - 1]) gasto(m, 19, 'Ropa del bebé', '👕 Ropa', ropa[m - 1])
}
gasto(4, 8, 'Revisión del coche', '🚗 Vehículo', 129)
gasto(7, 22, 'Silla de paseo', '👶 Bebé', 189)
gasto(9, 27, 'Cumpleaños de la abuela', '🎉 Salidas', 45)

const gastos_fijos = [
  { id: 'f1', nombre: 'Alquiler', categoria: '🏠 Alquiler', monto: 850, dia_del_mes: 1, activo: true, fecha_inicio: '2025-01-01', fecha_fin: null, created_at: '1', usuario_id: 'u1' },
  { id: 'f2', nombre: 'Escuela infantil', categoria: '👶 Bebé', monto: 280, dia_del_mes: 5, activo: true, fecha_inicio: '2026-01-05', fecha_fin: null, created_at: '2', usuario_id: 'u1' },
  { id: 'f3', nombre: 'Luz', categoria: '💡 Luz', monto: 58.4, dia_del_mes: 24, activo: true, fecha_inicio: '2025-01-24', fecha_fin: null, created_at: '3', usuario_id: 'u1' },
  { id: 'f4', nombre: 'Fibra y móviles', categoria: '🌐 Internet', monto: 45, dia_del_mes: 23, activo: true, fecha_inicio: '2025-01-23', fecha_fin: null, created_at: '4', usuario_id: 'u1' },
  { id: 'f5', nombre: 'Seguro del coche', categoria: '🚗 Vehículo', monto: 38.5, dia_del_mes: 10, activo: true, fecha_inicio: '2025-03-10', fecha_fin: null, created_at: '5', usuario_id: 'u1' },
  { id: 'f6', nombre: 'Netflix', categoria: '📺 Suscripción', monto: 12.99, dia_del_mes: 28, activo: true, fecha_inicio: '2025-05-28', fecha_fin: null, created_at: '6', usuario_id: 'u1' },
]

const perfil = [{
  id: 'p1', usuario_id: 'u1', nombre: 'Lucía', moneda: '€', premium: false, codigos_usados: '', perfil_presupuesto: 'equilibrado',
  categorias: '🏠 Alquiler,🛒 Supermercado,👶 Bebé,⛽ Gasolina,🎉 Salidas,❤️ Salud,👕 Ropa,💡 Luz,🌐 Internet,🚗 Vehículo,📺 Suscripción,📦 Otros,💼 Nómina',
}]

const metas = [{ id: 7, nombre: 'Entrada del piso', icono: '🏠', monto_objetivo: 15000, monto_actual: 0, fecha_inicio: '2026-01-01', fecha_limite: '2027-09-01', es_principal: true, usuario_id: 'u1' }]

const prestamos = [
  { id: 'pr1', nombre: 'Javi', tipo: 'preste', monto_total: 300, fecha_inicio: '2026-08-10', moneda: '€', activo: true, usuario_id: 'u1', created_at: '1' },
]
const prestamos_pagos = [
  { id: 'pg1', prestamo_id: 'pr1', fecha: '2026-09-10', descripcion: 'Bizum', monto: 100, tipo: 'abono', usuario_id: 'u1' },
  { id: 'pg2', prestamo_id: 'pr1', fecha: '2026-10-10', descripcion: 'Bizum', monto: 100, tipo: 'abono', usuario_id: 'u1' },
]

const familia = () => JSON.parse(JSON.stringify({
  gastos, ingresos, gastos_fijos, perfil, metas,
  categoria_tipo: [{ categoria: '🏠 Alquiler', tipo: 'necesario', es_fijo: false }, { categoria: '🛒 Supermercado', tipo: 'necesario', es_fijo: false }, { categoria: '👶 Bebé', tipo: 'necesario', es_fijo: false }],
  user_gasto_plan: [], user_preferences: [], user_budget_mode: [], colchon_movimientos: [],
  prestamos, prestamos_pagos, viajes: [], viajes_items: [],
}))

module.exports = { familia }
