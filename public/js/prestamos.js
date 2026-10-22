// mifinanza-prestamos.html — préstamos por persona: lo que te deben y lo que debes.
// Tablas: prestamos (nombre, tipo 'preste'|'debo', monto_total, fecha_inicio, moneda, activo) y
// prestamos_pagos (prestamo_id, fecha, descripcion, monto, tipo 'abono'|'prestado').
// monto_total ya incluye lo prestado de más; pendiente = monto_total − abonos.
// El estado de cuenta en PDF se genera en el móvil (jsPDF, se descarga solo al usarlo) y se comparte.
window.moneda = localStorage.getItem('moneda') || '$'

const { esc, fechaLocal } = MF
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const MONEDAS = ['€', '$', 'Bs', 'S/', 'R$', '£']
const COLORES = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#0ea5e9', '#84cc16']  // sin rojo: en la app el rojo es «debes»
const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'

let prestamos = [], pagos = {}, tab = 'preste', miNombre = ''

// ── Cálculos ───────────────────────────────────────────────
const num = v => parseFloat(v || 0)
const movsDe = p => pagos[p.id] || []
function cuentas(p) {
  const movs = movsDe(p)
  const devuelto = movs.filter(m => (m.tipo || 'abono') === 'abono').reduce((s, m) => s + num(m.monto), 0)
  const extra = movs.filter(m => m.tipo === 'prestado').reduce((s, m) => s + num(m.monto), 0)
  const total = num(p.monto_total)
  const ultimoAbono = movs.filter(m => (m.tipo || 'abono') === 'abono').sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  return { total, devuelto, inicial: Math.max(0, total - extra), pendiente: Math.max(0, total - devuelto), pct: total > 0 ? Math.min(100, devuelto / total * 100) : 0, ultimoAbono }
}
const din = (n, p) => MF.dinero(n, undefined, p?.moneda || window.moneda)
const fechaTxt = f => { const [y, m, d] = String(f || '').slice(0, 10).split('-'); return d ? `${+d} ${MESES[+m - 1]}${y !== String(new Date().getFullYear()) ? ' ' + y : ''}` : '—' }
function haceTxt(f) {
  const dias = Math.round((new Date(fechaLocal() + 'T12:00') - new Date(String(f).slice(0, 10) + 'T12:00')) / 864e5)
  return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : dias < 30 ? `hace ${dias} días` : dias < 60 ? 'hace 1 mes' : `hace ${Math.round(dias / 30)} meses`
}
const colorDe = nombre => COLORES[[...String(nombre)].reduce((s, c) => s + c.codePointAt(0), 0) % COLORES.length]
const inicial = n => (String(n || '?').trim()[0] || '?').toUpperCase()

// ── Carga ──────────────────────────────────────────────────
async function cargarPrestamos() {
  for (let i = 0; i < 100 && !window.currentUserId; i++) await new Promise(r => setTimeout(r, 50))
  const uid = window.currentUserId
  if (!uid) return
  const [rP, rG, rPerfil] = await Promise.all([
    dbClient.from('prestamos').select('*').eq('usuario_id', uid).order('created_at', { ascending: false }),
    dbClient.from('prestamos_pagos').select('*').eq('usuario_id', uid).order('fecha', { ascending: false }),
    dbClient.from('perfil').select('nombre').eq('usuario_id', uid).limit(1),
  ])
  if (rP.error || rG.error) { $('lista').innerHTML = '<div class="cargando">No se pudieron cargar los préstamos.</div>'; return }
  prestamos = rP.data || []
  pagos = {}
  for (const m of rG.data || []) (pagos[m.prestamo_id] = pagos[m.prestamo_id] || []).push(m)
  miNombre = rPerfil.data?.[0]?.nombre || ''
  render()
}

// ── Pintar ─────────────────────────────────────────────────
const $ = id => document.getElementById(id)

function render() {
  document.querySelector('.phone').classList.toggle('debo', tab === 'debo')
  document.querySelectorAll('.pestanas [data-tab]').forEach(b => {
    const n = prestamos.filter(p => p.tipo === b.dataset.tab && p.activo).length
    b.setAttribute('aria-selected', String(b.dataset.tab === tab))
    b.innerHTML = (b.dataset.tab === 'preste' ? 'Me deben' : 'Debo') + (n ? ` <span>${n}</span>` : '')
  })
  pintarResumen()
  const lista = prestamos.filter(p => p.tipo === tab)
  const activos = lista.filter(p => p.activo).sort((a, b) => cuentas(b).pendiente - cuentas(a).pendiente)
  const saldados = lista.filter(p => !p.activo)
  const cont = $('lista')
  if (!lista.length) {
    cont.innerHTML = `<div class="vacio"><b>${tab === 'preste' ? 'Nadie te debe nada' : 'No debes nada'}</b>
      <p>${tab === 'preste' ? 'Apunta lo que prestas y cada abono que te devuelvan. Podrás enviar el estado de cuenta en PDF por WhatsApp.' : 'Apunta lo que te prestan y lo que vas devolviendo, para saber siempre cuánto queda.'}</p>
      <button type="button" class="btn-grande" onclick="abrirModalNuevo()">${tab === 'preste' ? 'Apuntar un préstamo' : 'Apuntar una deuda'}</button></div>`
    return
  }
  cont.innerHTML = activos.map(tarjeta).join('') +
    (saldados.length ? `<details class="plegable"><summary><div class="sec-tit">Saldados (${saldados.length})</div></summary>${saldados.map(tarjeta).join('')}</details>` : '')
  cont.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => abrirDetalle(b.dataset.id)))
}

function tarjeta(p) {
  const c = cuentas(p)
  const sub = c.ultimoAbono ? `Último abono ${haceTxt(c.ultimoAbono.fecha)}` : `Desde ${fechaTxt(p.fecha_inicio)} · sin abonos`
  return `<button type="button" class="persona${p.activo ? '' : ' saldada'}" data-id="${esc(p.id)}">
    <div class="p-top">
      <span class="avatar" style="background:${colorDe(p.nombre)}">${esc(inicial(p.nombre))}</span>
      <span class="p-info"><span class="p-nombre" style="display:block">${esc(p.nombre)}${p.activo ? '' : '<span class="etq">saldado</span>'}</span><span class="p-sub" style="display:block">${sub}</span></span>
      <span class="p-pend"><b class="num">${din(c.pendiente, p)}</b><small>${p.activo ? (tab === 'preste' ? 'te debe' : 'le debes') : 'pendiente'}</small></span>
    </div>
    <div class="p-barra"><i style="width:${c.pct}%"></i></div>
    <div class="p-pie"><span>Devuelto <b class="num">${din(c.devuelto, p)}</b> de ${din(c.total, p)}</span><span class="num">${Math.round(c.pct)} %</span></div>
  </button>`
}

function pintarResumen() {
  // Totales en la moneda del usuario; las demás monedas se nombran aparte
  const suma = tipo => {
    const porMoneda = {}
    for (const p of prestamos.filter(p => p.tipo === tipo && p.activo)) porMoneda[p.moneda || window.moneda] = (porMoneda[p.moneda || window.moneda] || 0) + cuentas(p).pendiente
    return porMoneda
  }
  const meDeben = suma('preste'), debo = suma('debo')
  const mio = window.moneda
  const otras = [...new Set([...Object.keys(meDeben), ...Object.keys(debo)])].filter(m => m !== mio)
  const balance = (meDeben[mio] || 0) - (debo[mio] || 0)
  const nP = prestamos.filter(p => p.tipo === 'preste' && p.activo).length, nD = prestamos.filter(p => p.tipo === 'debo' && p.activo).length
  $('resumen').innerHTML = `<div class="res-dos">
      <div><div class="res-lbl">Te deben</div><div class="res-valor verde num">${MF.dinero(meDeben[mio] || 0)}</div><div class="res-sub">${nP} persona${nP === 1 ? '' : 's'}</div></div>
      <div><div class="res-lbl">Debes</div><div class="res-valor rojo num">${MF.dinero(debo[mio] || 0)}</div><div class="res-sub">${nD} persona${nD === 1 ? '' : 's'}</div></div>
    </div>
    <div class="res-balance"><span>${balance >= 0 ? 'A tu favor' : 'En contra'}</span><b class="num">${MF.dinero(Math.abs(balance))}</b></div>
    ${otras.length ? `<div class="res-otras">También: ${otras.map(m => [meDeben[m] ? `te deben ${MF.dinero(meDeben[m], undefined, m)}` : '', debo[m] ? `debes ${MF.dinero(debo[m], undefined, m)}` : ''].filter(Boolean).join(' y ')).join(' · ')}</div>` : ''}`
}

document.querySelectorAll('.pestanas [data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render() }))

// ── Hoja ───────────────────────────────────────────────────
const raizHoja = $('hoja-raiz'), hoja = raizHoja.querySelector('.hoja')
let tCerrar
function abrirHoja(titulo, html, acento) {
  $('h-tit').textContent = titulo
  $('h-cuerpo').innerHTML = html
  hoja.style.setProperty('--acento', acento === 'debo' ? 'var(--red)' : 'var(--green)')
  hoja.style.setProperty('--acento-txt', acento === 'debo' ? 'var(--red-txt)' : 'var(--green-txt)')
  clearTimeout(tCerrar); hoja.inert = false
  document.documentElement.style.overflow = 'hidden'
  hoja.scrollTop = 0
  hoja.getBoundingClientRect()
  raizHoja.classList.add('h-abierta')
}
function cerrarHoja() {
  raizHoja.classList.remove('h-abierta')
  document.documentElement.style.overflow = ''
  document.activeElement?.blur?.()
  tCerrar = setTimeout(() => { hoja.inert = true }, 280)
}
raizHoja.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarHoja))
document.addEventListener('keydown', e => { if (e.key === 'Escape' && raizHoja.classList.contains('h-abierta')) cerrarHoja() })

// Piezas de formulario: importe grande, fecha (Hoy / Ayer / Otro día) y elección en botones
const parseImporte = v => parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
const importeTxt = n => (n % 1 ? n.toFixed(2) : String(n)).replace('.', ',')
function htmlImporte(valor, moneda) {
  const pre = moneda !== '€'
  return `<label class="importe"><span class="mon" id="f-mon-pre">${pre ? esc(moneda) : ''}</span><input id="f-monto" inputmode="decimal" autocomplete="off" placeholder="0" value="${valor ? importeTxt(valor) : ''}" aria-label="Importe"><span class="mon" id="f-mon-post">${pre ? '' : '€'}</span></label>`
}
function htmlFecha(f) {
  return `<div class="chips" role="group" aria-label="Fecha"><button type="button" class="chip" data-dia="0">Hoy</button><button type="button" class="chip" data-dia="1">Ayer</button><button type="button" class="chip" data-otra>📅 Otro día</button></div>
    <input type="date" class="fecha-oculta" id="f-fecha" value="${esc(f)}" max="${fechaLocal()}" tabindex="-1" aria-hidden="true">`
}
function enlazarFecha() {
  const inp = $('f-fecha')
  const pintar = () => {
    const f = inp.value, hoy = fechaLocal(), d = new Date(); d.setDate(d.getDate() - 1); const ayer = fechaLocal(d)
    document.querySelector('[data-dia="0"]').setAttribute('aria-pressed', String(f === hoy))
    document.querySelector('[data-dia="1"]').setAttribute('aria-pressed', String(f === ayer))
    const otra = document.querySelector('[data-otra]'), es = f !== hoy && f !== ayer
    otra.setAttribute('aria-pressed', String(es)); otra.textContent = es ? '📅 ' + fechaTxt(f) : '📅 Otro día'
  }
  document.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => { const d = new Date(); d.setDate(d.getDate() - +b.dataset.dia); inp.value = fechaLocal(d); pintar() }))
  document.querySelector('[data-otra]').addEventListener('click', () => { try { inp.showPicker() } catch { inp.focus() } })
  inp.addEventListener('change', pintar)
  pintar()
}
function enlazarImporte(alCambiar) {
  const inp = $('f-monto')
  const ajustar = () => { inp.value = inp.value.replace(/[^\d.,]/g, ''); inp.style.width = Math.max(1, inp.value.length) + 'ch'; alCambiar() }
  inp.addEventListener('input', ajustar); ajustar()
}
function enlazarSegm(id, alElegir) {
  document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll(`#${id} button`).forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    alElegir(b.dataset.v)
  }))
}

// ── Nuevo préstamo (nav.js lo abre desde el botón +) ───────
function abrirModalNuevo() {
  let tipo = tab, moneda = window.moneda
  const nombres = [...new Set(prestamos.map(p => p.nombre))].slice(0, 6)
  abrirHoja('Nuevo préstamo', `
    <div class="segm" id="f-tipo"><button type="button" data-v="preste" aria-pressed="${tipo === 'preste'}">📥 Me deben</button><button type="button" data-v="debo" aria-pressed="${tipo === 'debo'}">📤 Debo</button></div>
    ${htmlImporte(0, moneda)}
    ${htmlFecha(fechaLocal())}
    <div class="campo"><label class="lbl" for="f-nombre" id="f-nombre-lbl">¿Quién te lo debe?</label><input class="inp" id="f-nombre" placeholder="Nombre" maxlength="40" autocomplete="off">
      ${nombres.length ? `<div class="sugerencias">${nombres.map(n => `<button type="button" class="chip" data-nombre="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}</div>
    <div class="campo"><span class="lbl">Moneda</span><div class="chips" style="justify-content:flex-start;margin:0" id="f-monedas">${MONEDAS.map(m => `<button type="button" class="chip" data-m="${esc(m)}" aria-pressed="${m === moneda}">${esc(m)}</button>`).join('')}</div></div>
    <button type="button" class="btn-grande" id="f-ok" disabled>Guardar</button>`, tipo)
  const validar = () => {
    const n = parseImporte($('f-monto').value)
    $('f-ok').disabled = !(n > 0 && $('f-nombre').value.trim())
    $('f-ok').textContent = n > 0 ? `Guardar ${MF.dinero(n, undefined, moneda)}` : 'Guardar'
  }
  enlazarSegm('f-tipo', v => {
    tipo = v
    hoja.style.setProperty('--acento', v === 'debo' ? 'var(--red)' : 'var(--green)')
    hoja.style.setProperty('--acento-txt', v === 'debo' ? 'var(--red-txt)' : 'var(--green-txt)')
    $('f-nombre-lbl').textContent = v === 'debo' ? '¿A quién se lo debes?' : '¿Quién te lo debe?'
  })
  enlazarImporte(validar); enlazarFecha()
  $('f-nombre').addEventListener('input', validar)
  document.querySelectorAll('[data-nombre]').forEach(b => b.addEventListener('click', () => { $('f-nombre').value = b.dataset.nombre; validar() }))
  document.querySelectorAll('#f-monedas [data-m]').forEach(b => b.addEventListener('click', () => {
    moneda = b.dataset.m
    document.querySelectorAll('#f-monedas [data-m]').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
    $('f-mon-pre').textContent = moneda !== '€' ? moneda : ''; $('f-mon-post').textContent = moneda !== '€' ? '' : '€'
    validar()
  }))
  $('f-ok').addEventListener('click', async () => {
    $('f-ok').disabled = true
    const fila = { nombre: $('f-nombre').value.trim(), tipo, monto_total: Math.round(parseImporte($('f-monto').value) * 100) / 100, fecha_inicio: $('f-fecha').value, moneda, activo: true, usuario_id: window.currentUserId }
    const { data, error } = await dbClient.from('prestamos').insert([fila]).select()
    if (error) { validar(); aviso('No se pudo guardar: ' + error.message); return }
    const p = { id: 'tmp' + Date.now(), ...fila, ...(data?.[0] || {}) }
    prestamos.unshift(p); pagos[p.id] = []
    tab = tipo; cerrarHoja(); render()
    aviso(`${fila.nombre}: ${MF.dinero(fila.monto_total, undefined, moneda)} apuntado`)
  })
  setTimeout(() => $('f-monto').focus({ preventScroll: true }), 50)
}

// ── Detalle de una persona ─────────────────────────────────
function abrirDetalle(id) {
  const p = prestamos.find(x => String(x.id) === String(id))
  if (!p) return
  const c = cuentas(p), deben = p.tipo === 'preste'
  // Línea de tiempo: el préstamo inicial y cada movimiento, del más reciente al más antiguo
  const movs = [...movsDe(p)].sort((a, b) => b.fecha.localeCompare(a.fecha) || String(b.id).localeCompare(String(a.id)))
  abrirHoja(p.nombre, `
    <p class="nota" style="text-align:left;margin:0 0 10px">${deben ? `${esc(p.nombre)} te debe` : `Le debes a ${esc(p.nombre)}`} · desde ${fechaTxt(p.fecha_inicio)}</p>
    <div class="det-cifras">
      <div><span>Prestado</span><b class="num">${din(c.total, p)}</b></div>
      <div><span>Devuelto</span><b class="num">${din(c.devuelto, p)}</b></div>
      <div class="pend"><span>Pendiente</span><b class="num">${din(c.pendiente, p)}</b></div>
    </div>
    <div class="p-barra" style="margin:0 0 14px"><i style="width:${c.pct}%"></i></div>
    ${p.activo ? `<div class="acciones2"><button type="button" class="btn-grande" id="d-abono">＋ ${deben ? 'Me devolvió' : 'Devolví'}</button><button type="button" class="btn-sec" id="d-mas">${deben ? 'Le presté más' : 'Me prestó más'}</button></div>` : ''}
    <button type="button" class="btn-grande btn-wa" id="d-pdf" style="margin-top:4px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3 3 3-3"/></svg>
      Enviar estado de cuenta (PDF)</button>
    <button type="button" class="btn-texto" id="d-texto" style="width:100%">o enviar un resumen por WhatsApp</button>
    <div class="linea">
      ${movs.map(m => `<button type="button" class="mov ${m.tipo === 'prestado' ? 'prestado' : 'abono'}" data-mov="${esc(m.id)}">
        <span class="mov-info"><b>${esc(m.descripcion || (m.tipo === 'prestado' ? (deben ? 'Le prestaste más' : 'Te prestó más') : (deben ? 'Te devolvió' : 'Devolviste')))}</b><small>${fechaTxt(m.fecha)} · ${m.tipo === 'prestado' ? 'préstamo' : 'abono'}</small></span>
        <span class="mov-monto num">${m.tipo === 'prestado' ? '+' : '−'}${din(m.monto, p)}</span></button>`).join('')}
      <div class="mov"><span class="mov-info"><b>${deben ? 'Le prestaste' : 'Te prestó'}</b><small>${fechaTxt(p.fecha_inicio)} · inicio</small></span><span class="mov-monto num">${din(c.inicial, p)}</span></div>
    </div>
    <div class="det-pie">
      <button type="button" class="btn-sec" id="d-saldar">${p.activo ? (c.pendiente > 0 ? 'Marcar como saldado' : '✓ Marcar como saldado') : 'Reabrir'}</button>
      <button type="button" class="btn-texto" id="d-editar">Editar nombre, fecha o importe inicial</button>
      <button type="button" class="btn-texto peligro" id="d-borrar">Eliminar préstamo</button>
    </div>`, p.tipo)
  if (p.activo) {
    $('d-abono').addEventListener('click', () => abrirMovimiento(p, 'abono'))
    $('d-mas').addEventListener('click', () => abrirMovimiento(p, 'prestado'))
  }
  $('d-pdf').addEventListener('click', () => compartirPDF(p))
  $('d-texto').addEventListener('click', () => compartirTexto(p))
  document.querySelectorAll('[data-mov]').forEach(b => b.addEventListener('click', () => abrirMovimiento(p, null, movsDe(p).find(m => String(m.id) === b.dataset.mov))))
  $('d-saldar').addEventListener('click', () => cambiarActivo(p, !p.activo))
  $('d-editar').addEventListener('click', () => editarPrestamo(p))
  $('d-borrar').addEventListener('click', () => borrarPrestamo(p))
}

// ── Abono / préstamo adicional (nuevo o editar) ────────────
function abrirMovimiento(p, tipoInicial, mov) {
  let tipo = mov ? (mov.tipo || 'abono') : tipoInicial
  const c = cuentas(p), deben = p.tipo === 'preste'
  const titulo = mov ? 'Editar movimiento' : tipo === 'abono' ? (deben ? `${p.nombre} te devolvió` : `Le devolviste a ${p.nombre}`) : (deben ? `Le prestaste más a ${p.nombre}` : `${p.nombre} te prestó más`)
  abrirHoja(titulo, `
    ${mov ? '' : `<div class="segm" id="f-tipo"><button type="button" data-v="abono" aria-pressed="${tipo === 'abono'}">${deben ? 'Me devolvió' : 'Devolví'}</button><button type="button" data-v="prestado" aria-pressed="${tipo === 'prestado'}">${deben ? 'Le presté más' : 'Me prestó más'}</button></div>`}
    ${htmlImporte(mov ? num(mov.monto) : 0, p.moneda || window.moneda)}
    <div class="chips" id="f-todo"${tipo === 'abono' && !mov && c.pendiente > 0 ? '' : ' hidden'}><button type="button" class="chip">Todo lo pendiente · ${din(c.pendiente, p)}</button></div>
    ${htmlFecha(mov ? String(mov.fecha).slice(0, 10) : fechaLocal())}
    <div class="campo"><label class="lbl" for="f-desc">Nota (opcional)</label><input class="inp" id="f-desc" maxlength="60" placeholder="Ej: Bizum, efectivo, transferencia" value="${esc(mov?.descripcion || '')}"></div>
    <button type="button" class="btn-grande" id="f-ok" disabled>Guardar</button>
    ${mov ? '<button type="button" class="btn-texto peligro" id="f-borrar" style="width:100%;margin-top:6px">Eliminar movimiento</button>' : ''}`, p.tipo)
  const validar = () => {
    const n = parseImporte($('f-monto').value)
    $('f-ok').disabled = !(n > 0)
    $('f-ok').textContent = n > 0 ? `Guardar ${din(n, p)}` : 'Guardar'
  }
  if (!mov) enlazarSegm('f-tipo', v => { tipo = v; $('f-todo').hidden = !(v === 'abono' && c.pendiente > 0) })
  enlazarImporte(validar); enlazarFecha()
  $('f-todo').querySelector('button').addEventListener('click', () => { $('f-monto').value = importeTxt(c.pendiente); $('f-monto').dispatchEvent(new Event('input')) })
  $('f-ok').addEventListener('click', async () => {
    $('f-ok').disabled = true
    const datos = { fecha: $('f-fecha').value, descripcion: $('f-desc').value.trim(), monto: Math.round(parseImporte($('f-monto').value) * 100) / 100 }
    if (mov) {
      const { error } = await dbClient.from('prestamos_pagos').update(datos).eq('id', mov.id).eq('usuario_id', window.currentUserId)
      if (error) { validar(); aviso('No se pudo guardar: ' + error.message); return }
      if (tipo === 'prestado') await ajustarTotal(p, datos.monto - num(mov.monto))
      Object.assign(mov, datos)
      abrirDetalle(p.id); render(); aviso('Movimiento actualizado')
      return
    }
    const fila = { prestamo_id: p.id, usuario_id: window.currentUserId, tipo, ...datos }
    const { data, error } = await dbClient.from('prestamos_pagos').insert([fila]).select()
    if (error) { validar(); aviso('No se pudo guardar: ' + error.message); return }
    const nuevo = { id: 'tmp' + Date.now(), ...fila, ...(data?.[0] || {}) }
    ;(pagos[p.id] = pagos[p.id] || []).push(nuevo)
    if (tipo === 'prestado') await ajustarTotal(p, datos.monto)
    // Si con este abono queda en cero, se marca como saldado (con Deshacer)
    if (tipo === 'abono' && cuentas(p).pendiente <= 0.005) {
      await cambiarActivo(p, false, true)
      abrirDetalle(p.id); render()
      aviso(deben ? `🎉 ${p.nombre} ya no te debe nada` : `🎉 Ya no le debes nada a ${p.nombre}`, () => cambiarActivo(p, true))
      return
    }
    abrirDetalle(p.id); render()
    aviso(tipo === 'abono' ? `${din(datos.monto, p)} apuntado · quedan ${din(cuentas(p).pendiente, p)}` : `${din(datos.monto, p)} más apuntado`)
  })
  if (mov) $('f-borrar').addEventListener('click', () => borrarMovimiento(p, mov))
  setTimeout(() => $('f-monto').focus({ preventScroll: true }), 50)
}

async function ajustarTotal(p, diferencia) {
  if (!diferencia) return
  const nuevo = Math.max(0, num(p.monto_total) + diferencia)
  const { error } = await dbClient.from('prestamos').update({ monto_total: nuevo }).eq('id', p.id).eq('usuario_id', window.currentUserId)
  if (error) { aviso('Se guardó, pero no se pudo actualizar el total'); return }
  p.monto_total = nuevo
}

async function cambiarActivo(p, activo, silencio) {
  const { error } = await dbClient.from('prestamos').update({ activo }).eq('id', p.id).eq('usuario_id', window.currentUserId)
  if (error) { aviso('No se pudo cambiar: ' + error.message); return }
  p.activo = activo
  if (silencio) return
  render()
  if (raizHoja.classList.contains('h-abierta')) abrirDetalle(p.id)
  aviso(activo ? `${p.nombre} vuelve a estar pendiente` : `${p.nombre} saldado`, () => cambiarActivo(p, !activo))
}

function editarPrestamo(p) {
  const c = cuentas(p)
  abrirHoja('Editar préstamo', `
    <div class="campo"><label class="lbl" for="f-nombre">Nombre</label><input class="inp" id="f-nombre" maxlength="40" value="${esc(p.nombre)}"></div>
    <span class="lbl" style="text-align:center">Importe inicial</span>
    ${htmlImporte(c.inicial, p.moneda || window.moneda)}
    ${htmlFecha(String(p.fecha_inicio).slice(0, 10))}
    <button type="button" class="btn-grande" id="f-ok">Guardar cambios</button>`, p.tipo)
  const validar = () => { $('f-ok').disabled = !(parseImporte($('f-monto').value) > 0 && $('f-nombre').value.trim()) }
  enlazarImporte(validar); enlazarFecha()
  $('f-nombre').addEventListener('input', validar)
  $('f-ok').addEventListener('click', async () => {
    const inicialNuevo = Math.round(parseImporte($('f-monto').value) * 100) / 100
    const datos = { nombre: $('f-nombre').value.trim(), fecha_inicio: $('f-fecha').value, monto_total: Math.round((num(p.monto_total) + inicialNuevo - c.inicial) * 100) / 100 }
    const { error } = await dbClient.from('prestamos').update(datos).eq('id', p.id).eq('usuario_id', window.currentUserId)
    if (error) { aviso('No se pudo guardar: ' + error.message); return }
    Object.assign(p, datos)
    abrirDetalle(p.id); render(); aviso('Cambios guardados')
  })
}

// Borrar: desaparece al momento y se borra de verdad a los 5 s, salvo que se pulse Deshacer
function borrarDiferido(texto, quitar, restaurar, borrarDeVerdad) {
  quitar(); render()
  let cancelado = false
  const t = setTimeout(() => { if (!cancelado) borrarDeVerdad() }, 5000)
  aviso(texto, () => { cancelado = true; clearTimeout(t); restaurar(); render() })
}
function borrarPrestamo(p) {
  cerrarHoja()
  const idx = prestamos.indexOf(p)
  borrarDiferido(`${p.nombre} eliminado`, () => { prestamos = prestamos.filter(x => x !== p) }, () => { prestamos.splice(idx, 0, p) }, async () => {
    await dbClient.from('prestamos_pagos').delete().eq('prestamo_id', p.id).eq('usuario_id', window.currentUserId)
    await dbClient.from('prestamos').delete().eq('id', p.id).eq('usuario_id', window.currentUserId)
  })
}
function borrarMovimiento(p, mov) {
  borrarDiferido('Movimiento eliminado', () => {
    pagos[p.id] = movsDe(p).filter(m => m !== mov)
    if (mov.tipo === 'prestado') p.monto_total = num(p.monto_total) - num(mov.monto)
    abrirDetalle(p.id)
  }, () => {
    pagos[p.id].push(mov)
    if (mov.tipo === 'prestado') p.monto_total = num(p.monto_total) + num(mov.monto)
    if (raizHoja.classList.contains('h-abierta')) abrirDetalle(p.id)
  }, async () => {
    await dbClient.from('prestamos_pagos').delete().eq('id', mov.id).eq('usuario_id', window.currentUserId)
    if (mov.tipo === 'prestado') await dbClient.from('prestamos').update({ monto_total: p.monto_total }).eq('id', p.id).eq('usuario_id', window.currentUserId)
  })
}

// ── Compartir ──────────────────────────────────────────────
// Movimientos en orden de fecha con el saldo después de cada uno (lo que ve la otra persona)
function extracto(p) {
  const c = cuentas(p)
  const filas = [{ fecha: String(p.fecha_inicio).slice(0, 10), concepto: 'Préstamo inicial', prestado: c.inicial, abonado: 0 }]
  for (const m of [...movsDe(p)].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const presto = m.tipo === 'prestado'
    filas.push({ fecha: String(m.fecha).slice(0, 10), concepto: m.descripcion || (presto ? 'Préstamo adicional' : 'Abono'), prestado: presto ? num(m.monto) : 0, abonado: presto ? 0 : num(m.monto) })
  }
  let saldo = 0
  for (const f of filas) { saldo += f.prestado - f.abonado; f.saldo = Math.max(0, saldo) }
  return { c, filas }
}

function textoResumen(p) {
  const { c } = extracto(p), deben = p.tipo === 'preste'
  const lineas = [
    `Hola ${p.nombre} 👋`,
    deben ? 'Te paso cómo vamos con el préstamo:' : 'Te paso cómo voy con lo que te debo:',
    '',
    `• Prestado: ${din(c.total, p)}`,
    `• Devuelto: ${din(c.devuelto, p)}`,
    `• Pendiente: *${din(c.pendiente, p)}*`,
  ]
  if (c.ultimoAbono) lineas.push('', `Último abono: ${din(c.ultimoAbono.monto, p)} el ${fechaTxt(c.ultimoAbono.fecha)}.`)
  lineas.push('', c.pendiente <= 0 ? '¡Todo saldado, gracias! 🙌' : deben ? '¡Gracias! 🙌' : 'Te iré abonando. ¡Gracias! 🙌')
  return lineas.join('\n')
}

function compartirTexto(p) {
  window.open('https://wa.me/?text=' + encodeURIComponent(textoResumen(p)), '_blank', 'noopener')
}

function cargarJsPDF() {
  if (window.jspdf) return Promise.resolve(window.jspdf)
  return new Promise((ok, mal) => {
    const s = document.createElement('script')
    s.src = JSPDF; s.onload = () => ok(window.jspdf); s.onerror = () => mal(new Error('sin conexión'))
    document.head.appendChild(s)
  })
}

async function crearPDF(p) {
  const { jsPDF } = await cargarJsPDF()
  const { c, filas } = extracto(p), deben = p.tipo === 'preste'
  // jsPDF con las fuentes estándar no tiene espacio fino: se usa uno normal
  const d = n => din(n, p).replace(' ', ' ')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, M = 16
  // Cabecera
  doc.setFillColor(10, 14, 26); doc.rect(0, 0, W, 40, 'F')
  doc.setFillColor(16, 185, 129); doc.rect(0, 40, W, 1.2, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text('Estado de cuenta', M, 19)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(148, 163, 184)
  const quien = miNombre || 'Yo'
  doc.text(deben ? `${quien} le prestó a ${p.nombre}` : `${p.nombre} le prestó a ${quien}`, M, 28)
  doc.text(`Emitido el ${fechaTxt(fechaLocal())} ${new Date().getFullYear()}`, M, 34)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(52, 211, 153); doc.setFontSize(11)
  doc.text('MiFinanzas', W - M, 19, { align: 'right' })
  // Tres cifras
  const cajas = [['PRESTADO', d(c.total), [241, 245, 249]], ['DEVUELTO', d(c.devuelto), [16, 185, 129]], ['PENDIENTE', d(c.pendiente), deben ? [16, 185, 129] : [239, 68, 68]]]
  const cw = (W - 2 * M - 12) / 3
  cajas.forEach(([lbl, val, col], i) => {
    const x = M + i * (cw + 6), y = 50
    doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, cw, 22, 3, 3, 'FD')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(100, 116, 139); doc.text(lbl, x + 5, y + 8)
    doc.setFontSize(14); doc.setTextColor(...(i === 0 ? [15, 23, 42] : col)); doc.text(val, x + 5, y + 17)
  })
  // Barra de progreso
  doc.setFillColor(226, 232, 240); doc.roundedRect(M, 78, W - 2 * M, 3, 1.5, 1.5, 'F')
  if (c.pct > 0) { doc.setFillColor(16, 185, 129); doc.roundedRect(M, 78, (W - 2 * M) * c.pct / 100, 3, 1.5, 1.5, 'F') }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(100, 116, 139)
  doc.text(`Devuelto el ${Math.round(c.pct)} %`, M, 87)
  // Tabla de movimientos
  const col = [M, M + 28, M + 98, M + 128, W - M]
  let y = 98
  const cabecera = () => {
    doc.setFillColor(15, 23, 42); doc.rect(M, y - 6, W - 2 * M, 9, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255)
    doc.text('FECHA', col[0] + 3, y); doc.text('CONCEPTO', col[1], y)
    doc.text('PRESTADO', col[3] - 2, y, { align: 'right' }); doc.text('ABONADO', col[3] + 24, y, { align: 'right' }); doc.text('SALDO', col[4] - 3, y, { align: 'right' })
    y += 9
  }
  cabecera()
  doc.setFontSize(9.5)
  filas.forEach((f, i) => {
    if (y > 270) { doc.addPage(); y = 20; cabecera(); doc.setFontSize(9.5) }
    if (i % 2) { doc.setFillColor(248, 250, 252); doc.rect(M, y - 5.5, W - 2 * M, 8, 'F') }
    doc.setFont('helvetica', 'normal'); doc.setTextColor(51, 65, 85)
    const [yy, mm, dd] = f.fecha.split('-')
    doc.text(`${dd}/${mm}/${yy}`, col[0] + 3, y)
    doc.text(doc.splitTextToSize(f.concepto, 64)[0], col[1], y)
    doc.setTextColor(180, 83, 9); if (f.prestado) doc.text(d(f.prestado), col[3] - 2, y, { align: 'right' })
    doc.setTextColor(5, 150, 105); if (f.abonado) doc.text(d(f.abonado), col[3] + 24, y, { align: 'right' })
    doc.setFont('helvetica', 'bold'); doc.setTextColor(15, 23, 42); doc.text(d(f.saldo), col[4] - 3, y, { align: 'right' })
    y += 8
  })
  // Total
  doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.4); doc.line(M, y - 3, W - M, y - 3)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(15, 23, 42)
  doc.text(c.pendiente > 0 ? (deben ? `${p.nombre} debe` : `${quien} debe`) : 'Saldado', M + 3, y + 4)
  doc.text(d(c.pendiente), W - M - 3, y + 4, { align: 'right' })
  // Pie
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(148, 163, 184)
  doc.text('Documento informativo generado con MiFinanzas a partir de los movimientos apuntados.', W / 2, 287, { align: 'center' })
  return doc.output('blob')
}

async function compartirPDF(p) {
  const btn = $('d-pdf'), antes = btn.innerHTML
  btn.disabled = true; btn.textContent = 'Preparando el PDF…'
  try {
    const blob = await crearPDF(p)
    const nombreArchivo = `Estado de cuenta - ${p.nombre}.pdf`.replace(/[\\/:*?"<>|]/g, '')
    const archivo = new File([blob], nombreArchivo, { type: 'application/pdf' })
    window.__ULTIMO_PDF__ = blob
    // En el móvil abre «Compartir» con el PDF adjunto (WhatsApp, correo…)
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: `Estado de cuenta · ${p.nombre}`, text: textoResumen(p) }).catch(() => {})
    } else {
      // Sin «Compartir» con archivos (ordenador): se descarga y se abre WhatsApp con el resumen
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = nombreArchivo
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      aviso('PDF descargado: adjúntalo en WhatsApp')
    }
  } catch (e) {
    aviso('No se pudo crear el PDF: ' + e.message)
  } finally {
    btn.disabled = false; btn.innerHTML = antes
  }
}

// ── Aviso con deshacer ─────────────────────────────────────
let tAviso
function aviso(texto, deshacer) {
  const t = $('toast'), b = t.querySelector('button')
  t.querySelector('span').textContent = texto
  b.hidden = !deshacer
  b.onclick = deshacer ? () => { t.classList.remove('ver'); deshacer() } : null
  t.classList.add('ver')
  clearTimeout(tAviso)
  tAviso = setTimeout(() => t.classList.remove('ver'), deshacer ? 5000 : 2800)
}

cargarPrestamos()
