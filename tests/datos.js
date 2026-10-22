// Datos de prueba: un usuario con 10 meses de movimientos (enero–octubre 2026), gastos fijos,
// una meta y su perfil. La fecha de las pruebas es el 21 de octubre de 2026 (lib.js).
const pad = n => String(n).padStart(2, '0')
const gastos = [], ingresos = []
let id = 1
const gasto = (m, d, descripcion, categoria, monto, origen = 'manual') =>
  gastos.push({ id: id++, fecha: `2026-${pad(m)}-${pad(d)}`, descripcion, categoria, monto, origen, usuario_id: 'u1' })

const gasolina = [30, 42, 58, 168, 136, 271, 217, 324, 68, 26]
const salidas = [0, 0, 15, 68, 116, 36, 78, 104, 179, 110]
for (let m = 1; m <= 10; m++) {
  ingresos.push({ id: 'i' + m, fecha: `2026-${pad(m)}-01`, monto: m === 8 ? 1500 : 1380, concepto: 'Nómina', tipo: '💼 Nómina', origen: 'manual', usuario_id: 'u1' })
  ;[3, 10, 17].forEach((d, k) => { if (m < 10 || d < 21) gasto(m, d, k % 2 ? 'Carrefour' : 'Mercadona', '🛒 Supermercado', 50 + (m * 7 + k * 5) % 30) })
  if (gasolina[m - 1]) gasto(m, 12, 'Gasolina', '⛽ Gasolina', gasolina[m - 1])
  if (salidas[m - 1]) gasto(m, 13 + (m % 2), 'Salida con amigos', '🎉 Salidas', salidas[m - 1])
  gasto(m, 20, 'Corte de pelo', '🧴 Cuidado personal', 15)
  gasto(m, 9, m % 3 ? 'Multa' : 'Suscripción olvidada', '⚠️ Gastos Imprevistos', 60 + (m * 13) % 90)
  gasto(m, 15, 'Vzla', '🌍 Remesas', m === 10 ? 211 : 91)
  if (m >= 5 && m <= 9) gasto(m, 14, 'NETFLIX.COM', '📺 Suscripción', 12.99, 'importado')
}
// El alquiler importado del banco que repite el gasto fijo (julio–septiembre)
for (const m of [7, 8, 9]) gasto(m, 1, 'TRANSF ALQUILER PISO', '🏠 Alquiler', 418, 'importado')
gasto(3, 18, 'Cambio de aceite', '🚗 Vehículo', 203.35)
gasto(9, 2, 'Cambio de aceite', '🚗 Vehículo', 45)

const gastos_fijos = [
  { id: 'f1', nombre: 'Alquiler', categoria: '🏠 Alquiler', monto: 418, dia_del_mes: 1, activo: true, fecha_inicio: '2025-01-01', fecha_fin: null, created_at: '1', usuario_id: 'u1' },
  { id: 'f2', nombre: 'Luz', categoria: '💡 Luz', monto: 45.5, dia_del_mes: 25, activo: true, fecha_inicio: '2025-01-25', fecha_fin: null, created_at: '2', usuario_id: 'u1' },
  { id: 'f3', nombre: 'Basic Fit', categoria: '🏋️ Gym', monto: 25, dia_del_mes: 22, activo: true, fecha_inicio: '2026-01-28', fecha_fin: null, created_at: '3', usuario_id: 'u1' },
  { id: 'f4', nombre: 'Préstamo coche', categoria: '💳 Crédito', monto: 180, dia_del_mes: 5, activo: true, fecha_inicio: '2024-06-05', fecha_fin: '2027-02-28', created_at: '4', usuario_id: 'u1' },
  { id: 'f5', nombre: 'Spotify', categoria: '📺 Suscripción', monto: 10.99, dia_del_mes: 12, activo: false, fecha_inicio: '2025-01-12', fecha_fin: '2026-08-12', created_at: '5', usuario_id: 'u1' },
  { id: 'f6', nombre: 'Seguro hogar', categoria: '📋 Trámite', monto: 22, dia_del_mes: 3, activo: true, fecha_inicio: '2026-12-03', fecha_fin: null, created_at: '6', usuario_id: 'u1' },
]

const perfil = [{
  id: 'p1', usuario_id: 'u1', nombre: 'Carlos', moneda: '€', premium: false, codigos_usados: '', perfil_presupuesto: 'equilibrado',
  categorias: '🏠 Alquiler,🛒 Supermercado,⛽ Gasolina,🎉 Salidas,🌍 Remesas,⚠️ Gastos Imprevistos,🧴 Cuidado personal,🚗 Vehículo,📺 Suscripción,💡 Luz,🏋️ Gym,💳 Crédito,📋 Trámite,📦 Otros,💼 Nómina',
}]

const metas = [{ id: 7, nombre: 'Viaje a Japón', icono: '✈️', monto_objetivo: 1351.84, monto_actual: 0, fecha_inicio: '2026-01-01', fecha_limite: '2026-12-01', es_principal: true, usuario_id: 'u1' }]

const completo = () => JSON.parse(JSON.stringify({
  gastos, ingresos, gastos_fijos, perfil, metas,
  categoria_tipo: [{ categoria: '🏠 Alquiler', tipo: 'necesario', es_fijo: false }, { categoria: '🛒 Supermercado', tipo: 'necesario', es_fijo: false }],
  user_gasto_plan: [], user_preferences: [], user_budget_mode: [], colchon_movimientos: [],
  prestamos: [], prestamos_pagos: [], viajes: [], viajes_items: [],
}))
const vacio = () => ({ gastos: [], ingresos: [], gastos_fijos: [], perfil: [{ id: 'p1', usuario_id: 'u1', nombre: '', moneda: '€', categorias: '' }], metas: [] })

module.exports = { completo, vacio }
