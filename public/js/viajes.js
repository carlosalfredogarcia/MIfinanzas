// mifinanza-viajes.html — se carga al final de la página, después de auth.js
window.moneda = localStorage.getItem('moneda') || '$'
const _color = localStorage.getItem('color'); if (_color) document.documentElement.style.setProperty('--accent', _color)

const MESES_ABR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

let todosViajes   = []
let itemsPorViaje = {}
let viajeActivo   = null
let tabViajeActiva = 'gasto'
let itemEditando  = null

function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = `toast ${tipo} show`
  setTimeout(() => { t.className = 'toast' }, 2500)
}

const fmt = n => MF.dinero(n, 0)

function fmtFechaViaje(f) {
  if (!f) return 'Sin fecha estimada'
  const [anio, mes, dia] = f.substring(0, 10).split('-')
  return `${parseInt(dia, 10)} ${MESES_ABR[parseInt(mes, 10) - 1]} ${anio}`
}

async function cargarViajes() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); resolve() } }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const uid = window.currentUserId

  const [{ data: viajes, error: errV }, { data: items, error: errI }] = await Promise.all([
    dbClient.from('viajes').select('*').eq('usuario_id', uid).order('created_at', { ascending: false }),
    dbClient.from('viajes_items').select('*').eq('usuario_id', uid)
  ])

  if (errV || errI) {
    document.getElementById('lista-viajes').innerHTML = '<div class="loading">No se pudieron cargar los viajes.</div>'
    return
  }

  todosViajes = viajes || []
  itemsPorViaje = {}
  ;(items || []).forEach(it => {
    if (!itemsPorViaje[it.viaje_id]) itemsPorViaje[it.viaje_id] = []
    itemsPorViaje[it.viaje_id].push(it)
  })

  renderListaViajes()
}

function balanceViaje(id) {
  const items = itemsPorViaje[id] || []
  const ingresos = items.filter(i => i.tipo === 'ingreso').reduce((s, i) => s + parseFloat(i.monto || 0), 0)
  const gastos   = items.filter(i => i.tipo === 'gasto').reduce((s, i) => s + parseFloat(i.monto || 0), 0)
  return { ingresos, gastos, balance: ingresos - gastos }
}

function renderListaViajes() {
  const wrap = document.getElementById('lista-viajes')
  if (todosViajes.length === 0) {
    wrap.innerHTML = '<div class="loading">Aún no tienes viajes. ¡Crea uno! ✈️</div>'
    return
  }
  wrap.innerHTML = ''
  todosViajes.forEach(v => {
    const { balance } = balanceViaje(v.id)
    const positivo = balance >= 0
    const div = document.createElement('div')
    div.className = 'viaje-card'
    div.onclick = () => abrirDetalle(v.id)
    div.innerHTML = `
      <div class="viaje-icon">${v.emoji || '✈️'}</div>
      <div class="viaje-info">
        <div class="viaje-nombre">${v.nombre}</div>
        <div class="viaje-fecha">${fmtFechaViaje(v.fecha_estimada)}</div>
      </div>
      <div class="viaje-balance ${positivo ? 'positivo' : 'negativo'}">${positivo ? '+' : '-'}${fmt(Math.abs(balance))}</div>
    `
    wrap.appendChild(div)
  })
}

function abrirDetalle(id) {
  viajeActivo = id
  tabViajeActiva = 'gasto'
  document.getElementById('vista-lista').style.display = 'none'
  document.getElementById('vista-detalle').style.display = 'block'
  renderDetalle()
}

function volverALista() {
  viajeActivo = null
  document.getElementById('vista-detalle').style.display = 'none'
  document.getElementById('vista-lista').style.display = 'block'
  renderListaViajes()
}

function renderDetalle() {
  const v = todosViajes.find(x => String(x.id) === String(viajeActivo))
  if (!v) { volverALista(); return }

  document.getElementById('det-nombre').textContent = `${v.emoji || '✈️'} ${v.nombre}`
  document.getElementById('det-fecha').textContent = fmtFechaViaje(v.fecha_estimada)

  const { ingresos, gastos, balance } = balanceViaje(v.id)
  document.getElementById('det-ingresos').textContent = fmt(ingresos)
  document.getElementById('det-gastos').textContent = fmt(gastos)
  const balEl = document.getElementById('det-balance')
  balEl.textContent = (balance >= 0 ? '+' : '-') + fmt(Math.abs(balance))
  balEl.style.color = balance >= 0 ? '#3fb950' : '#f85149'

  document.getElementById('tab-gastos').classList.toggle('active', tabViajeActiva === 'gasto')
  document.getElementById('tab-ingresos').classList.toggle('active', tabViajeActiva === 'ingreso')

  renderListaItems()
}

function setTabViaje(tipo) {
  tabViajeActiva = tipo
  renderDetalle()
}

function renderListaItems() {
  const wrap = document.getElementById('lista-items')
  const items = (itemsPorViaje[viajeActivo] || []).filter(i => i.tipo === tabViajeActiva)
  if (items.length === 0) {
    wrap.innerHTML = `<div class="loading">Sin ${tabViajeActiva === 'gasto' ? 'gastos' : 'ingresos'} todavía.</div>`
    return
  }
  wrap.innerHTML = items.map(it => `
    <div class="item-row">
      <div class="item-desc">${it.descripcion || '—'}</div>
      <div class="item-monto">${fmt(it.monto)}</div>
      <div class="item-acciones">
        <span class="item-btn" onclick="abrirModalEditarItem('${it.id}')">✏️</span>
        <span class="item-btn" onclick="eliminarItem('${it.id}')">🗑</span>
      </div>
    </div>
  `).join('')
}

async function eliminarViaje() {
  if (!viajeActivo) return
  if (!confirm('¿Eliminar este viaje y todos sus gastos/ingresos?')) return
  const { error: errItems } = await dbClient.from('viajes_items')
    .delete().eq('viaje_id', viajeActivo).eq('usuario_id', window.currentUserId)
  if (errItems) { toast('Error al eliminar items', 'err'); return }
  const { error } = await dbClient.from('viajes')
    .delete().eq('id', viajeActivo).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al eliminar', 'err'); return }

  todosViajes = todosViajes.filter(v => String(v.id) !== String(viajeActivo))
  delete itemsPorViaje[viajeActivo]
  toast('Viaje eliminado')
  volverALista()
}

function abrirModalViaje() {
  document.getElementById('v-nombre').value = ''
  document.getElementById('v-emoji').value = ''
  document.getElementById('v-fecha').value = ''
  document.getElementById('modal-viaje').style.display = 'flex'
}
function cerrarModalViaje() { document.getElementById('modal-viaje').style.display = 'none' }

async function guardarViaje() {
  const nombre = document.getElementById('v-nombre').value.trim()
  const emoji  = document.getElementById('v-emoji').value.trim() || '✈️'
  const fecha  = document.getElementById('v-fecha').value

  if (!nombre) { alert('Escribe un nombre'); return }

  const { data, error } = await dbClient.from('viajes')
    .insert([{ nombre, emoji, fecha_estimada: fecha || null, usuario_id: window.currentUserId }])
    .select()
  if (error) { alert('Error: ' + error.message); return }

  todosViajes.unshift(data[0])
  itemsPorViaje[data[0].id] = []
  cerrarModalViaje()
  toast('Viaje creado ✓')
  renderListaViajes()
}

function abrirModalItem() {
  itemEditando = null
  document.getElementById('item-modal-title').textContent = tabViajeActiva === 'gasto' ? 'Añadir gasto' : 'Añadir ingreso'
  document.getElementById('item-descripcion').value = ''
  document.getElementById('item-monto').value = ''
  document.getElementById('modal-item').style.display = 'flex'
}

function cerrarModalItem() {
  document.getElementById('modal-item').style.display = 'none'
  itemEditando = null
}

function abrirModalEditarItem(id) {
  const it = (itemsPorViaje[viajeActivo] || []).find(x => String(x.id) === String(id))
  if (!it) return
  itemEditando = id
  document.getElementById('item-modal-title').textContent = it.tipo === 'gasto' ? 'Editar gasto' : 'Editar ingreso'
  document.getElementById('item-descripcion').value = it.descripcion || ''
  document.getElementById('item-monto').value = it.monto
  document.getElementById('modal-item').style.display = 'flex'
}

async function guardarItem() {
  const descripcion = document.getElementById('item-descripcion').value.trim()
  const monto = parseFloat(document.getElementById('item-monto').value)

  if (!descripcion || isNaN(monto) || monto <= 0) { alert('Completa descripción y monto'); return }

  if (itemEditando) {
    const { error } = await dbClient.from('viajes_items')
      .update({ descripcion, monto })
      .eq('id', itemEditando).eq('usuario_id', window.currentUserId)
    if (error) { alert('Error: ' + error.message); return }
    const it = (itemsPorViaje[viajeActivo] || []).find(x => String(x.id) === String(itemEditando))
    if (it) { it.descripcion = descripcion; it.monto = monto }
    toast('Actualizado ✓')
  } else {
    const { data, error } = await dbClient.from('viajes_items')
      .insert([{ viaje_id: viajeActivo, usuario_id: window.currentUserId, tipo: tabViajeActiva, descripcion, monto }])
      .select()
    if (error) { alert('Error: ' + error.message); return }
    if (!itemsPorViaje[viajeActivo]) itemsPorViaje[viajeActivo] = []
    itemsPorViaje[viajeActivo].push(data[0])
    toast('Guardado ✓')
  }

  cerrarModalItem()
  renderDetalle()
  renderListaViajes()
}

async function eliminarItem(id) {
  if (!confirm('¿Eliminar este movimiento?')) return
  const { error } = await dbClient.from('viajes_items')
    .delete().eq('id', id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al eliminar', 'err'); return }

  itemsPorViaje[viajeActivo] = (itemsPorViaje[viajeActivo] || []).filter(x => String(x.id) !== String(id))
  toast('Eliminado')
  renderDetalle()
  renderListaViajes()
}

document.getElementById('modal-viaje').addEventListener('click', function(e) { if (e.target === this) cerrarModalViaje() })
document.getElementById('modal-item').addEventListener('click', function(e) { if (e.target === this) cerrarModalItem() })

cargarViajes()
