// mifinanza-prestamos.html — se carga al final de la página, después de auth.js
window.moneda = localStorage.getItem('moneda') || '$'
const _color = localStorage.getItem('color'); if (_color) document.documentElement.style.setProperty('--accent', _color)

const MESES_ABR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

let todosPrestamos = []
let todosPagos = {}
let tabActiva = 'preste'
let historialAbierto = null
let pagoTargetId = null

function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = `toast ${tipo} show`
  setTimeout(() => { t.className = 'toast' }, 2500)
}

function fmtNum(n) {
  return parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtFecha(f) {
  if (!f) return '—'
  const [anio, mes] = f.substring(0, 7).split('-')
  return `${MESES_ABR[parseInt(mes, 10) - 1]} ${anio}`
}

function fmtFechaCorta(f) {
  if (!f) return '—'
  const [, mes, dia] = f.substring(0, 10).split('-')
  return `${parseInt(dia, 10)} ${MESES_ABR[parseInt(mes, 10) - 1]}`
}

function pagadoTotal(id) {
  return (todosPagos[id] || [])
    .filter(p => (p.tipo || 'abono') === 'abono')
    .reduce((s, p) => s + parseFloat(p.monto || 0), 0)
}

async function cargarPrestamos() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); resolve() } }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const uid = window.currentUserId

  const [{ data: prestamos, error: errP }, { data: pagos, error: errPg }] = await Promise.all([
    dbClient.from('prestamos').select('*').eq('usuario_id', uid).order('created_at', { ascending: false }),
    dbClient.from('prestamos_pagos').select('*').eq('usuario_id', uid).order('fecha', { ascending: false })
  ])

  if (errP || errPg) {
    document.getElementById('lista-prestamos').innerHTML = '<div class="loading">No se pudieron cargar los préstamos.</div>'
    return
  }

  todosPrestamos = prestamos || []
  todosPagos = {}
  ;(pagos || []).forEach(p => {
    if (!todosPagos[p.prestamo_id]) todosPagos[p.prestamo_id] = []
    todosPagos[p.prestamo_id].push(p)
  })

  renderPrestamos()
}

function setTab(tab) {
  tabActiva = tab
  document.getElementById('tab-preste').classList.toggle('active', tab === 'preste')
  document.getElementById('tab-debo').classList.toggle('active', tab === 'debo')
  renderPrestamos()
}

function renderPrestamos() {
  const lista = todosPrestamos.filter(p => p.tipo === tabActiva)
  const activos = lista.filter(p => p.activo)
  const pagados = lista.filter(p => !p.activo)
  const ordenados = [...activos, ...pagados]

  const totalPendiente = activos.reduce((s, p) => s + Math.max(0, p.monto_total - pagadoTotal(p.id)), 0)
  const monedaBanner   = (activos[0] || lista[0])?.moneda || '$'
  document.getElementById('banner-label').textContent = tabActiva === 'preste' ? 'Total que te deben' : 'Total que debes'
  document.getElementById('banner-valor').textContent = monedaBanner + fmtNum(totalPendiente)
  document.getElementById('banner-icon').textContent  = tabActiva === 'preste' ? '📥' : '📤'

  const wrap = document.getElementById('lista-prestamos')
  wrap.innerHTML = ''

  if (ordenados.length === 0) {
    wrap.innerHTML = `<div class="loading">${tabActiva === 'preste' ? 'Nadie te debe nada todavía.' : 'No debes nada todavía.'}</div>`
    return
  }

  ordenados.forEach(p => {
    const pagado    = pagadoTotal(p.id)
    const pendiente = Math.max(0, p.monto_total - pagado)
    const pct       = p.monto_total > 0 ? Math.min(100, (pagado / p.monto_total) * 100) : 0
    const moneda    = p.moneda || '$'

    const card = document.createElement('div')
    card.className = 'prestamo-card' + (p.activo ? '' : ' pagado')
    card.innerHTML = `
      <div class="prestamo-top">
        <div>
          <div class="prestamo-nombre">${p.nombre}</div>
          <div class="prestamo-fecha">Desde ${fmtFecha(p.fecha_inicio)}</div>
        </div>
        <div class="switch ${p.activo ? 'on' : ''}" onclick="toggleActivo('${p.id}')"></div>
      </div>
      <div class="prestamo-montos">
        <span>Total prestado: <strong class="monto-prestado">${moneda}${fmtNum(p.monto_total)}</strong></span>
        <span>Pendiente: <strong class="monto-pendiente">${moneda}${fmtNum(pendiente)}</strong></span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="prestamo-percent">${pct.toFixed(0)}%</div>
      <div class="prestamo-acciones">
        <button class="btn-accion" onclick="toggleHistorial('${p.id}')">📄 Ver historial</button>
        <button class="btn-accion" onclick="abrirModalPago('${p.id}')">➕ Añadir pago</button>
        <button class="btn-accion danger-btn" onclick="eliminarPrestamo('${p.id}')">🗑</button>
      </div>
      <div class="historial-wrap" id="historial-${p.id}"></div>
    `
    wrap.appendChild(card)
    if (String(historialAbierto) === String(p.id)) renderHistorial(p.id)
  })
}

function renderHistorial(id) {
  const cont = document.getElementById('historial-' + id)
  if (!cont) return
  const prestamo = todosPrestamos.find(pr => String(pr.id) === String(id))
  if (!prestamo) return
  const moneda = prestamo.moneda || '$'

  const movimientos = (todosPagos[id] || [])
    .map(pg => ({
      id: pg.id,
      fecha: pg.fecha,
      descripcion: pg.descripcion || (pg.tipo === 'prestado' ? 'Préstamo' : 'Abono'),
      monto: parseFloat(pg.monto || 0),
      tipo: pg.tipo || 'abono'
    }))
    .sort((a, b) => {
      if (a.tipo !== b.tipo) return a.tipo === 'prestado' ? -1 : 1
      return new Date(b.fecha) - new Date(a.fecha)
    })

  const totalDevuelto = movimientos.filter(m => m.tipo === 'abono').reduce((s, m) => s + m.monto, 0)
  const pendiente = Math.max(0, parseFloat(prestamo.monto_total || 0) - totalDevuelto)

  if (movimientos.length === 0) {
    cont.innerHTML = '<div class="historial-empty">Sin movimientos registrados aún.</div>'
    cont.style.display = 'block'
    return
  }

  cont.innerHTML = `
    <table class="historial-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th style="text-align:right">Monto</th><th></th></tr></thead>
      <tbody>
        ${movimientos.map(m => {
          const esPrestado = m.tipo === 'prestado'
          const clase   = esPrestado ? 'monto-prestado' : 'monto-abono'
          const etiqueta = esPrestado ? '↑ PRESTADO' : '↓ ABONO'
          const signo    = esPrestado ? '+' : '-'
          return `<tr>
            <td>${fmtFechaCorta(m.fecha)}</td>
            <td>${m.descripcion}<div class="historial-tag ${clase}">${etiqueta}</div></td>
            <td class="monto ${clase}">${signo}${moneda}${fmtNum(m.monto)}</td>
            <td class="historial-acciones">
              <span class="historial-btn" onclick="abrirModalEditarPago('${m.id}', '${id}')">✏️</span>
              <span class="historial-btn" onclick="eliminarPago('${m.id}', '${id}')">🗑</span>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
    <div class="historial-footer">
      <span>${movimientos.length} movimiento${movimientos.length === 1 ? '' : 's'}</span>
      <span>Devuelto: <strong class="monto-abono">${moneda}${fmtNum(totalDevuelto)}</strong></span>
      <span>Pendiente: <strong class="monto-pendiente">${moneda}${fmtNum(pendiente)}</strong></span>
    </div>
  `
  cont.style.display = 'block'
}

function toggleHistorial(id) {
  historialAbierto = String(historialAbierto) === String(id) ? null : id
  renderPrestamos()
}

async function toggleActivo(id) {
  const p = todosPrestamos.find(pr => String(pr.id) === String(id))
  if (!p) return
  const { error } = await dbClient.from('prestamos').update({ activo: !p.activo }).eq('id', id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al actualizar', 'err'); return }
  p.activo = !p.activo
  renderPrestamos()
}

async function eliminarPrestamo(id) {
  if (!confirm('¿Eliminar este préstamo y todo su historial de pagos?')) return
  const { error: errPagos } = await dbClient.from('prestamos_pagos').delete().eq('prestamo_id', id).eq('usuario_id', window.currentUserId)
  if (errPagos) { toast('Error al eliminar pagos', 'err'); return }
  const { error } = await dbClient.from('prestamos').delete().eq('id', id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al eliminar', 'err'); return }
  todosPrestamos = todosPrestamos.filter(p => String(p.id) !== String(id))
  delete todosPagos[id]
  if (String(historialAbierto) === String(id)) historialAbierto = null
  toast('Préstamo eliminado')
  renderPrestamos()
}

function abrirModalPago(id) {
  pagoTargetId = id
  document.getElementById('pago-tipo').value = 'abono'
  document.getElementById('pago-fecha').value = new Date().toISOString().split('T')[0]
  document.getElementById('pago-descripcion').value = ''
  document.getElementById('pago-monto').value = ''
  document.getElementById('modal-pago').style.display = 'flex'
}

function cerrarModalPago() {
  document.getElementById('modal-pago').style.display = 'none'
  pagoTargetId = null
}

async function guardarPago() {
  if (!pagoTargetId) return
  const tipo        = document.getElementById('pago-tipo').value
  const fecha       = document.getElementById('pago-fecha').value
  const descripcion = document.getElementById('pago-descripcion').value.trim()
  const monto       = parseFloat(document.getElementById('pago-monto').value)

  if (!fecha || isNaN(monto) || monto <= 0) { alert('Completa fecha y monto'); return }

  const { data, error } = await dbClient.from('prestamos_pagos')
    .insert([{ prestamo_id: pagoTargetId, usuario_id: window.currentUserId, fecha, descripcion, monto, tipo }])
    .select()
  if (error) { alert('Error: ' + error.message); return }

  if (!todosPagos[pagoTargetId]) todosPagos[pagoTargetId] = []
  todosPagos[pagoTargetId].push(data[0])

  if (tipo === 'prestado') {
    await ajustarMontoTotal(pagoTargetId, monto)
  }

  historialAbierto = pagoTargetId
  cerrarModalPago()
  toast(tipo === 'prestado' ? 'Préstamo adicional registrado ✓' : 'Pago registrado ✓')
  renderPrestamos()
}

let pagoEditando = null

function abrirModalEditarPago(pagoId, prestamoId) {
  const pago = (todosPagos[prestamoId] || []).find(p => String(p.id) === String(pagoId))
  if (!pago) return
  pagoEditando = { id: pagoId, prestamoId }
  document.getElementById('ep-fecha').value = (pago.fecha || '').substring(0, 10)
  document.getElementById('ep-descripcion').value = pago.descripcion || ''
  document.getElementById('ep-monto').value = pago.monto
  document.getElementById('modal-editar-pago').style.display = 'flex'
}

function cerrarModalEditarPago() {
  document.getElementById('modal-editar-pago').style.display = 'none'
  pagoEditando = null
}

async function ajustarMontoTotal(prestamoId, diferencia) {
  if (!diferencia) return
  const prestamo = todosPrestamos.find(p => String(p.id) === String(prestamoId))
  if (!prestamo) return
  const nuevoTotal = Math.max(0, parseFloat(prestamo.monto_total || 0) + diferencia)
  const { error } = await dbClient.from('prestamos')
    .update({ monto_total: nuevoTotal })
    .eq('id', prestamoId)
    .eq('usuario_id', window.currentUserId)
  if (error) { toast('El movimiento se guardó, pero no se pudo actualizar el total', 'err'); return }
  prestamo.monto_total = nuevoTotal
}

async function guardarEdicionPago() {
  if (!pagoEditando) return
  const fecha       = document.getElementById('ep-fecha').value
  const descripcion = document.getElementById('ep-descripcion').value.trim()
  const monto       = parseFloat(document.getElementById('ep-monto').value)

  if (!fecha || isNaN(monto) || monto <= 0) { alert('Completa fecha y monto'); return }

  const lista = todosPagos[pagoEditando.prestamoId] || []
  const idx = lista.findIndex(p => String(p.id) === String(pagoEditando.id))
  const pagoAnterior  = idx !== -1 ? lista[idx] : null
  const montoAnterior = pagoAnterior ? parseFloat(pagoAnterior.monto || 0) : 0
  const tipoPago      = pagoAnterior ? (pagoAnterior.tipo || 'abono') : 'abono'

  const { error } = await dbClient.from('prestamos_pagos')
    .update({ fecha, descripcion, monto })
    .eq('id', pagoEditando.id)
    .eq('usuario_id', window.currentUserId)
  if (error) { alert('Error: ' + error.message); return }

  if (idx !== -1) { lista[idx].fecha = fecha; lista[idx].descripcion = descripcion; lista[idx].monto = monto }

  if (tipoPago === 'prestado') {
    await ajustarMontoTotal(pagoEditando.prestamoId, monto - montoAnterior)
  }

  historialAbierto = pagoEditando.prestamoId
  cerrarModalEditarPago()
  toast('Movimiento actualizado ✓')
  renderPrestamos()
}

async function eliminarPago(pagoId, prestamoId) {
  if (!confirm('¿Eliminar este movimiento?')) return

  const pagoActual = (todosPagos[prestamoId] || []).find(p => String(p.id) === String(pagoId))

  const { error } = await dbClient.from('prestamos_pagos')
    .delete()
    .eq('id', pagoId)
    .eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al eliminar', 'err'); return }

  if (pagoActual && (pagoActual.tipo || 'abono') === 'prestado') {
    await ajustarMontoTotal(prestamoId, -parseFloat(pagoActual.monto || 0))
  }

  todosPagos[prestamoId] = (todosPagos[prestamoId] || []).filter(p => String(p.id) !== String(pagoId))
  historialAbierto = prestamoId
  toast('Movimiento eliminado')
  renderPrestamos()
}

function abrirModalNuevo() {
  document.getElementById('np-nombre').value  = ''
  document.getElementById('np-tipo').value    = tabActiva
  document.getElementById('np-monto').value   = ''
  document.getElementById('np-fecha').value   = new Date().toISOString().split('T')[0]
  document.getElementById('np-moneda').value  = window.moneda
  document.getElementById('modal-nuevo').style.display = 'flex'
}

function cerrarModalNuevo() {
  document.getElementById('modal-nuevo').style.display = 'none'
}

async function guardarPrestamo() {
  const nombre = document.getElementById('np-nombre').value.trim()
  const tipo   = document.getElementById('np-tipo').value
  const monto  = parseFloat(document.getElementById('np-monto').value)
  const fecha  = document.getElementById('np-fecha').value
  const moneda = document.getElementById('np-moneda').value

  if (!nombre || isNaN(monto) || monto <= 0 || !fecha) { alert('Completa todos los campos'); return }

  const { data, error } = await dbClient.from('prestamos').insert([{
    nombre, tipo, monto_total: monto, fecha_inicio: fecha, moneda, activo: true, usuario_id: window.currentUserId
  }]).select()
  if (error) { alert('Error: ' + error.message); return }

  todosPrestamos.unshift(data[0])
  todosPagos[data[0].id] = []

  cerrarModalNuevo()
  toast('Préstamo creado ✓')
  setTab(tipo)
}

document.getElementById('modal-nuevo').addEventListener('click', function(e) { if (e.target === this) cerrarModalNuevo() })
document.getElementById('modal-pago').addEventListener('click', function(e) { if (e.target === this) cerrarModalPago() })
document.getElementById('modal-editar-pago').addEventListener('click', function(e) { if (e.target === this) cerrarModalEditarPago() })

cargarPrestamos()
