// mifinanza-metas.html — se carga al final de la página, después de auth.js
let metaFondoData = null
let metaAbonarId = null
let todasMetasData = []
let idMetaEditar = null

function toast(msg, tipo = 'ok', ms = 2800) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.className = `toast ${tipo} show`
  setTimeout(() => { t.className = 'toast' }, ms)
}

// Importe en formato español con la moneda del usuario (el € va detrás). Sin decimales si son ,00.
const fmt = (n, dec) => MF.dinero(n, dec)

function fmtFecha(f) {
  if (!f) return 'Sin fecha'
  const partes = f.substring(0, 7).split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${meses[parseInt(partes[1]) - 1]} ${partes[0]}`
}

function mesesRestantes(fechaLimite) {
  if (!fechaLimite) return null
  const hoy    = new Date()
  const limite = new Date(fechaLimite.substring(0, 7) + '-01')
  // +1 porque el mes en curso todavía cuenta como un mes disponible para
  // ahorrar (coincide con que el ahorro real tampoco lo da por cerrado
  // todavía): de octubre a diciembre son 3 meses (oct, nov, dic), no 2.
  const diff = (limite.getFullYear() - hoy.getFullYear()) * 12 + (limite.getMonth() - hoy.getMonth()) + 1
  return Math.max(1, diff)
}

async function cargarMetas() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve() }
      }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const { data, error } = await dbClient
    .from('metas')
    .select('*')
    .eq('usuario_id', window.currentUserId)
    .order('id', { ascending: true })

  if (error) {
    toast('Error al cargar metas', 'err')
    return
  }

  // Una meta principal: la marcada como principal, si no la de 💰, si no la última creada.
  // (Antes solo se mostraba la de 💰 y una meta con otro emoji "desaparecía".)
  const fondo = data.find(m => m.es_principal) || data.find(m => m.icono === '💰') || data[data.length - 1] || null

  todasMetasData = data
  metaFondoData = fondo
  renderFondo(fondo)

  if (fondo) calcularAhorroReal()
}

function renderFondo(meta) {
  const btnEliminar = document.getElementById('btn-eliminar-p')
  const btnEditar   = document.getElementById('btn-editar-p')
  document.getElementById('meta-vacia').hidden = !!meta
  document.getElementById('bloque-principal').hidden = !meta
  document.getElementById('btn-a-seguimiento').hidden = !meta
  if (!meta) { document.getElementById('meta-realismo').hidden = true; document.getElementById('seg-meta').innerHTML = '' }
  elegirPasoInicial(!!meta)

  if (!meta) {
    document.getElementById('p-nombre').textContent  = 'Sin fondo de ahorro'
    document.getElementById('p-fecha').textContent   = 'Crea una meta de tipo Fondo 💰'
    document.getElementById('p-percent').textContent = '—'
    document.getElementById('p-barra').style.width   = '0%'
    document.getElementById('p-llevado').textContent = '$0'
    document.getElementById('p-faltan').value = '0'
    document.getElementById('p-objetivo').textContent = ''
    document.getElementById('ahorro-detalle').style.display = 'none'
    document.getElementById('ahorro-nota').style.display    = 'none'
    document.getElementById('promedio-wrap').style.display  = 'none'
    btnEliminar.style.display = 'none'
    btnEditar.style.display = 'none'
    return
  }

  document.getElementById('p-nombre').textContent = `${meta.icono || '🎯'} ${meta.nombre}`
  document.getElementById('p-fecha').textContent  = `${fmtFecha(meta.fecha_inicio)} → ${fmtFecha(meta.fecha_limite)}`
  btnEliminar.style.display = 'block'
  btnEditar.style.display = 'block'
}

// Lo que exige la meta al mes frente a lo que deja el plan (se repinta al cambiar el plan)
function renderPlanVs() {
  const w = document.querySelector('#promedio-texto .pv-wrap')
  if (!w || !metaProgreso) return
  const meses = mesesRestantes(metaProgreso.fechaLimite) || 1
  const mensual = Math.max(0, metaProgreso.objetivo - metaProgreso.actual) / meses
  const plan = Math.max(0, totalIngresos() - totalGastos()), tope = Math.max(mensual, plan, 1)
  w.innerHTML = `<span class="pv"><span>Necesitas</span><i class="pv-nec" style="--w:${(mensual / tope).toFixed(3)}"></i><b class="num">${fmt(Math.ceil(mensual))}</b></span>
    <span class="pv"><span>Tu plan deja</span><i class="pv-plan${plan < mensual ? ' corto' : ''}" style="--w:${(plan / tope).toFixed(3)}"></i><b class="num">${fmt(Math.round(plan))}</b></span>`
}
const ajustarAnchoFaltan = () => { const i = document.getElementById('p-faltan'); i.style.width = (String(i.value).length + 0.6) + 'ch' }
document.getElementById('p-faltan').addEventListener('input', ajustarAnchoFaltan)

// Anillo con el % de la meta y el camino de meses (inicio → hoy → fin)
function renderAnilloYCamino(pct) {
  const anillo = document.getElementById('meta-anillo'), camino = document.getElementById('meta-camino')
  if (!anillo || !metaFondoData) return
  const r = 70, c = 2 * Math.PI * r
  anillo.innerHTML = `<svg viewBox="0 0 170 170" width="170" height="170"><defs><linearGradient id="ma-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>
    <circle cx="85" cy="85" r="${r}" fill="none" stroke="#1f2937" stroke-width="14"/>
    <circle cx="85" cy="85" r="${r}" fill="none" stroke="url(#ma-g)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" transform="rotate(-90 85 85)" class="ma-arco"/></svg>
    <div class="ma-centro"><b class="num">${Math.round(pct)} %</b><span>conseguido</span></div>`
  const ini = new Date(metaFondoData.fecha_inicio + 'T00:00:00'), fin = new Date(metaFondoData.fecha_limite + 'T00:00:00'), hoy = new Date()
  const total = (fin.getFullYear() - ini.getFullYear()) * 12 + fin.getMonth() - ini.getMonth() + 1
  const actualIdx = (hoy.getFullYear() - ini.getFullYear()) * 12 + hoy.getMonth() - ini.getMonth()
  if (!(total > 0 && total <= 60)) { camino.innerHTML = ''; return }
  const M = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
  camino.innerHTML = `<div class="mc-puntos">${Array.from({ length: total }, (_, k) => {
    const m = (ini.getMonth() + k) % 12, est = k < actualIdx ? 'hecho' : k === actualIdx ? 'hoy' : ''
    return `<span class="mc-p ${est}"><i></i>${total <= 14 ? `<small>${M[m]}</small>` : ''}</span>`
  }).join('')}</div><div class="mc-txt">${actualIdx >= total ? 'Plazo terminado' : actualIdx < 0 ? 'Empieza pronto' : `Mes ${actualIdx + 1} de ${total} · quedan ${total - actualIdx}`}</div>`
}

function actualizarBarraPrincipal(actual, objetivo, fechaLimite) {
  const pct    = objetivo > 0 ? Math.min(100, (actual / objetivo) * 100) : 0
  const faltan = Math.max(0, objetivo - actual)

  document.getElementById('p-percent').textContent = `${Math.round(pct)} %`
  document.getElementById('p-llevado').textContent = fmt(actual)
  document.getElementById('p-faltan').value = Math.round(faltan)
  document.getElementById('p-faltan-mon').textContent = window.moneda || '€'
  ajustarAnchoFaltan()
  document.getElementById('p-objetivo').textContent = `Meta: ${fmt(Math.round(objetivo))}`
  setTimeout(() => { document.getElementById('p-barra').style.width = pct + '%' }, 100)

  metaProgreso = { actual, objetivo, fechaLimite }
  renderRealismo()
  renderAnilloYCamino(pct)
  const meses = mesesRestantes(fechaLimite)
  const promedio = document.getElementById('promedio-wrap')
  const texto = document.getElementById('promedio-texto')

  if (meses && faltan > 0) {
    const mensual = faltan / meses
    texto.innerHTML = `<span>Necesitas ahorrar <strong>${fmt(Math.ceil(mensual))}/mes</strong> para cumplir en ${meses} mes${meses === 1 ? '' : 'es'}</span><span class="pv-wrap"></span>`
    renderPlanVs()
    promedio.style.display = 'flex'
  } else if (faltan <= 0) {
    texto.textContent = '¡Meta cumplida! 🎉'
    promedio.style.display = 'flex'
  } else {
    promedio.style.display = 'none'
  }
}

async function actualizarFaltanManual() {
  if (!metaFondoData) return
  const input   = document.getElementById('p-faltan')
  const faltan  = parseFloat(input.value) || 0
  const actual  = parseFloat(metaFondoData.monto_actual || 0)
  const objetivo = Math.max(0, actual + faltan)

  const { error } = await dbClient.from('metas')
    .update({ monto_objetivo: objetivo })
    .eq('id', metaFondoData.id)

  if (error) { toast('Error al actualizar', 'err'); return }

  metaFondoData.monto_objetivo = objetivo
  actualizarBarraPrincipal(actual, objetivo, metaFondoData.fecha_limite)
  toast('Meta actualizada')
}

document.getElementById('p-faltan').addEventListener('change', actualizarFaltanManual)
document.getElementById('p-faltan').addEventListener('focus', function() { this.select() })

async function calcularAhorroReal() {
  if (!metaFondoData) return
  if (!metaFondoData.fecha_inicio) {
    toast('Esta meta no tiene fecha de inicio', 'err')
    return
  }

  const desde = metaFondoData.fecha_inicio.substring(0, 10)
  const uid   = window.currentUserId

  // El ahorro real solo cuenta meses completamente cerrados: el mes en
  // curso aún puede sumar más ingresos/gastos, así que no entra. "hasta"
  // es el último día del mes anterior al actual (en octubre, 30/09).
  const hoyDate       = new Date()
  const ultimoCerrado = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 0)
  const hasta = `${ultimoCerrado.getFullYear()}-${String(ultimoCerrado.getMonth() + 1).padStart(2, '0')}-${String(ultimoCerrado.getDate()).padStart(2, '0')}`

  const [{ data: ingData, error: errI }, { data: gasData, error: errG }, { data: fijData, error: errF }] = await Promise.all([
    dbClient.from('ingresos').select('monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
    dbClient.from('gastos').select('monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
    dbClient.from('gastos_fijos').select('monto, fecha_inicio, fecha_fin').eq('usuario_id', uid)
  ])

  if (errI || errG || errF) { toast('Error al leer datos', 'err'); return }

  const totalIngresos = ingData.reduce((s, r) => s + parseFloat(r.monto || 0), 0)
  const totalGastos   = gasData.reduce((s, r) => s + parseFloat(r.monto || 0), 0)

  // Gastos fijos: sumar el monto completo por cada mes del rango [desde, hasta]
  // (solo meses cerrados) en el que el gasto fijo estuvo activo (mismo
  // criterio que Estadísticas).
  const mesDesde  = desde.substring(0, 7)
  const mesHasta  = hasta.substring(0, 7)
  let totalFijos = 0
  ;(fijData || []).forEach(f => {
    const fDesde = f.fecha_inicio ? f.fecha_inicio.substring(0, 7) : null
    if (!fDesde) return
    const fHasta = f.fecha_fin ? f.fecha_fin.substring(0, 7) : mesHasta
    let mes = mesDesde
    while (mes <= mesHasta) {
      if (mes >= fDesde && mes <= fHasta) totalFijos += parseFloat(f.monto || 0)
      const [y, m] = mes.split('-').map(Number)
      mes = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    }
  })

  const ahorroReal = totalIngresos - totalGastos - totalFijos

  document.getElementById('d-ingresos').textContent = fmt(totalIngresos)
  document.getElementById('d-gastos').textContent   = fmt(totalGastos + totalFijos)
  document.getElementById('d-ahorro').textContent   = fmt(ahorroReal)

  const notaEl = document.getElementById('ahorro-nota')
  notaEl.textContent = `No incluye ${fmtFecha(hoyDate.toISOString())} (mes en curso)`
  notaEl.style.display = 'block'

  const actualPositivo = Math.max(0, ahorroReal)
  actualizarBarraPrincipal(actualPositivo, metaFondoData.monto_objetivo, metaFondoData.fecha_limite)

  await dbClient.from('metas')
    .update({ monto_actual: actualPositivo })
    .eq('id', metaFondoData.id)
}

async function eliminarFondo() {
  if (!metaFondoData) return
  if (!confirm(`¿Eliminar la meta "${metaFondoData.nombre}"?`)) return
  const { error } = await dbClient.from('metas').delete().eq('id', metaFondoData.id)
  if (error) { toast('Error al eliminar', 'err'); return }
  toast('Meta eliminada')
  cargarMetas()
}

function editarFondo() {
  if (metaFondoData) editarMeta(metaFondoData.id)
}

function editarMeta(id) {
  const meta = todasMetasData.find(m => String(m.id) === String(id))
  if (!meta) return
  idMetaEditar = id
  document.getElementById('em-nombre').value       = meta.nombre
  document.getElementById('em-monto').value        = meta.monto_objetivo
  document.getElementById('em-fecha-inicio').value = (meta.fecha_inicio || '').slice(0, 7)
  document.getElementById('em-fecha-fin').value    = (meta.fecha_limite || '').slice(0, 7)
  document.getElementById('em-icon').value         = meta.icono || ''
  document.getElementById('modal-editar-meta').classList.add('visible')
}

function cerrarModalEditarMeta() {
  document.getElementById('modal-editar-meta').classList.remove('visible')
  idMetaEditar = null
}

async function guardarEdicionMeta() {
  if (!idMetaEditar) return
  const nombre      = document.getElementById('em-nombre').value.trim()
  const monto       = parseFloat(document.getElementById('em-monto').value)
  const fechaInicio = document.getElementById('em-fecha-inicio').value
  const fechaFin    = document.getElementById('em-fecha-fin').value
  let   icono       = document.getElementById('em-icon').value.trim()

  if (!nombre || !monto || monto <= 0) { toast('Completa nombre y monto', 'err'); return }
  if (!fechaInicio) { toast('Completa la fecha inicio', 'err'); return }
  if (!fechaFin)    { toast('Completa la fecha fin', 'err'); return }
  if (!icono) icono = '🎯'

  const { error } = await dbClient.from('metas')
    .update({ nombre, monto_objetivo: monto, fecha_inicio: fechaInicio + '-01', fecha_limite: fechaFin + '-01', icono })
    .eq('id', idMetaEditar)
    .eq('usuario_id', window.currentUserId)

  if (error) { toast('Error: ' + error.message, 'err'); return }

  cerrarModalEditarMeta()
  toast('Meta actualizada ✓')
  cargarMetas()
}

async function guardarMeta() {
  const tipo        = 'ahorro'
  const nombre       = document.getElementById('m-nombre').value.trim()
  const monto        = parseFloat(document.getElementById('m-monto').value)
  const fechaInicio  = document.getElementById('m-fecha-inicio').value
  const fechaFin     = document.getElementById('m-fecha-fin').value
  let   icon         = document.getElementById('m-icon').value.trim()

  if (!nombre || !monto || monto <= 0) { toast('Completa nombre y monto', 'err'); return }
  if (!fechaInicio || !fechaFin) { toast('Completa fecha inicio y fecha fin', 'err'); return }
  if (fechaInicio > fechaFin) { toast('La fecha inicio no puede ser mayor a la fecha fin', 'err'); return }
  if (tipo === 'ahorro' && !icon) icon = '💰'
  if (!icon) icon = '🎯'

  const btn = document.getElementById('btn-guardar')
  btn.disabled = true
  btn.textContent = 'Guardando...'

  const { error } = await dbClient.from('metas').insert({
    nombre, icono: icon,
    monto_objetivo: monto, monto_actual: 0,
    fecha_inicio: fechaInicio + '-01',
    fecha_limite: fechaFin + '-01',
    es_principal: false,
    usuario_id: window.currentUserId
  })

  btn.disabled = false
  btn.textContent = 'Guardar meta'

  if (error) { toast('Error: ' + error.message, 'err'); return }

  document.getElementById('m-nombre').value = ''
  document.getElementById('m-monto').value  = ''
  document.getElementById('m-fecha-inicio').value = ''
  document.getElementById('m-fecha-fin').value  = ''
  document.getElementById('m-icon').value   = ''

  cerrarModal()
  toast('Meta creada ✓')
  cargarMetas()
}

function abrirModalAbonar(id, nombre) {
  metaAbonarId = id
  document.getElementById('abonar-titulo').textContent = `Abonar a: ${nombre}`
  document.getElementById('abonar-monto').value = ''
  document.getElementById('modal-abonar').classList.add('visible')
}

function cerrarModalAbonar() {
  document.getElementById('modal-abonar').classList.remove('visible')
  metaAbonarId = null
}

async function confirmarAbono() {
  const monto = parseFloat(document.getElementById('abonar-monto').value)
  if (!monto || monto <= 0) { toast('Ingresa un monto válido', 'err'); return }
  const { data, error: errLeer } = await dbClient.from('metas').select('monto_actual').eq('id', metaAbonarId).single()
  if (errLeer) { toast('Error al leer meta', 'err'); return }
  const { error } = await dbClient.from('metas').update({ monto_actual: (data.monto_actual || 0) + monto }).eq('id', metaAbonarId)
  if (error) { toast('Error al abonar', 'err'); return }
  cerrarModalAbonar()
  toast(`Abono de ${fmt(monto)} registrado ✓`)
  cargarMetas()
}

async function eliminarMeta(id, btn) {
  if (!confirm('¿Eliminar esta meta?')) return
  btn.disabled = true
  const { error } = await dbClient.from('metas').delete().eq('id', id)
  if (error) { toast('Error al eliminar', 'err'); btn.disabled = false; return }
  toast('Meta eliminada')
  cargarMetas()
}

function abrirModal()  {
  if (metaFondoData) { irPaso(3); editarFondo(); return }  // una meta principal: se edita la que hay
  document.getElementById('modal').classList.add('visible')
}
function cerrarModal() {
  document.getElementById('modal').classList.remove('visible')
  _metaMontoEditado = false
  document.getElementById('m-calculo-bloque').style.display = 'none'
  document.getElementById('m-monto').value = ''
  document.getElementById('m-nombre').value = ''
  document.getElementById('m-fecha-inicio').value = ''
  document.getElementById('m-fecha-fin').value = ''
  document.getElementById('m-icon').value = ''
  document.querySelectorAll('.m-emoji-btn').forEach(b => b.classList.remove('m-sel'))
  ;['m-fecha-inicio','m-fecha-fin'].forEach(id => {
    const btn = document.querySelector(`[data-mp-for="${id}"]`)
    if (btn) { const t = btn.querySelector('.dp-txt'); if (t) { t.textContent = 'Seleccionar mes'; t.dataset.empty = 'true' } }
  })
}

let _metaMontoEditado = false
let _metaMontoSugerido = 0

async function calcularSugerenciaMeta() {
  const inicio = document.getElementById('m-fecha-inicio').value
  const fin    = document.getElementById('m-fecha-fin').value
  const bloque = document.getElementById('m-calculo-bloque')
  if (!inicio || !fin || inicio > fin) { bloque.style.display = 'none'; return }

  const now   = new Date()
  const cyear = now.getFullYear()
  const cmon  = now.getMonth() + 1   // 1-based

  const [iy, im] = inicio.split('-').map(Number)
  const [fy, fm] = fin.split('-').map(Number)

  const totalMeses = (fy - iy) * 12 + (fm - im) + 1

  // Meses restantes: desde el mes actual (inclusive) hasta fecha_fin
  let mesesRest = (fy - cyear) * 12 + (fm - cmon) + 1
  if (mesesRest < 0) mesesRest = 0

  // Mes anterior al actual (para label "lo que llevas")
  let prevY = cyear, prevM = cmon - 1
  if (prevM === 0) { prevM = 12; prevY-- }

  const MESES_CORTO = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const fmtMes = (y, m) => `${MESES_CORTO[m - 1]} ${y}`
  const mesS   = n => n === 1 ? 'mes' : 'meses'

  // "Lo que llevas" = ingresos − gastos − gastos_fijos desde fecha_inicio
  //   hasta el último día del mes anterior al actual (solo meses cerrados)
  let acumulado = 0
  const inicioEnFuturo = iy > cyear || (iy === cyear && im > cmon)

  if (!inicioEnFuturo && window.currentUserId) {
    const uid    = window.currentUserId
    const desde  = `${inicio}-01`
    const ultCerrado = new Date(cyear, now.getMonth(), 0)  // último día mes anterior
    const hasta  = `${ultCerrado.getFullYear()}-${String(ultCerrado.getMonth() + 1).padStart(2, '0')}-${String(ultCerrado.getDate()).padStart(2, '0')}`

    const [{ data: ingData }, { data: gasData }, { data: fijData }] = await Promise.all([
      dbClient.from('ingresos').select('monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
      dbClient.from('gastos').select('monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
      dbClient.from('gastos_fijos').select('monto, fecha_inicio, fecha_fin').eq('usuario_id', uid)
    ])

    const sumIng = (ingData || []).reduce((s, r) => s + parseFloat(r.monto || 0), 0)
    const sumGas = (gasData || []).reduce((s, r) => s + parseFloat(r.monto || 0), 0)

    const mesDesde = inicio              // "YYYY-MM"
    const mesHasta = hasta.substring(0, 7)
    let sumFij = 0
    ;(fijData || []).forEach(f => {
      const fD = f.fecha_inicio ? f.fecha_inicio.substring(0, 7) : null
      if (!fD) return
      const fH = f.fecha_fin ? f.fecha_fin.substring(0, 7) : mesHasta
      let mes = mesDesde
      while (mes <= mesHasta) {
        if (mes >= fD && mes <= fH) sumFij += parseFloat(f.monto || 0)
        const [y, m] = mes.split('-').map(Number)
        mes = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
      }
    })

    acumulado = Math.max(0, sumIng - sumGas - sumFij)
  }

  const dispMensual  = Math.max(0, totalIngresos() - totalGastos())
  const dispRestante = dispMensual * mesesRest
  // Redondeado hacia abajo: la meta sugerida nunca exige más de lo que deja el plan
  const sugerido     = Math.floor((acumulado + dispRestante) / 10) * 10
  _metaMontoSugerido = sugerido
  calcMeta = { acumulado, mesesRest, dispMensual }

  const mesInicio   = fmtMes(iy, im)
  const mesAnterior = fmtMes(prevY, prevM)
  const mesFin      = fmtMes(fy, fm)

  bloque.style.display = 'block'
  document.getElementById('m-calc-header').textContent     = `💡 CÁLCULO PARA ${totalMeses} ${mesS(totalMeses).toUpperCase()}`
  document.getElementById('m-calc-llevas').textContent     = fmt(acumulado)
  document.getElementById('m-calc-disponible').textContent = fmt(dispRestante)
  document.getElementById('m-calc-disp-sub').textContent   = `${fmt(dispMensual)}/mes × ${mesesRest} ${mesS(mesesRest)}`
  document.getElementById('m-calc-texto').textContent      =
    `Llevas acumulado ${fmt(acumulado)} desde ${mesInicio} hasta ${mesAnterior}. Te quedan ${mesesRest} ${mesS(mesesRest)} hasta ${mesFin}, con ${fmt(dispMensual)}/mes disponible → ${fmt(dispRestante)} más posibles.`

  if (!_metaMontoEditado) {
    document.getElementById('m-monto').value = sugerido > 0 ? Math.round(sugerido) : ''
  }
  realismoModal()
}

function selEmojiMeta(btn, emoji) {
  document.querySelectorAll('.m-emoji-btn').forEach(b => b.classList.remove('m-sel'))
  btn.classList.add('m-sel')
  document.getElementById('m-icon').value = emoji
}

document.getElementById('modal').addEventListener('click', function(e) { if (e.target === this) cerrarModal() })
document.getElementById('modal-abonar').addEventListener('click', function(e) { if (e.target === this) cerrarModalAbonar() })
document.getElementById('modal-editar-gasto-seg').addEventListener('click', function(e) { if (e.target === this) cerrarEdicionGastoSeg() })

const MESES_ABR_COLCHON = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function fmtDiaColchon(f) {
  if (!f) return '—'
  const [, mes, dia] = f.substring(0, 10).split('-')
  return `${parseInt(dia, 10)} ${MESES_ABR_COLCHON[parseInt(mes, 10) - 1]}`
}

let colchonMovimientos = []
let colchonEditando = null

async function cargarColchon() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); resolve() } }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const { data, error } = await dbClient.from('colchon_movimientos')
    .select('*')
    .eq('usuario_id', window.currentUserId)
    .order('fecha', { ascending: false })
  if (error) {
    document.getElementById('colchon-historial').innerHTML = '<div class="colchon-empty">No se pudo cargar.</div>'
    return
  }
  colchonMovimientos = data || []
  renderColchon()
}

function renderColchon() {
  const activos = colchonMovimientos.filter(m => m.activo)
  const total = activos.reduce((s, m) => s + (m.tipo === 'entrada' ? parseFloat(m.monto || 0) : -parseFloat(m.monto || 0)), 0)
  document.getElementById('colchon-total').textContent = fmt(total)

  const wrap = document.getElementById('colchon-historial')
  if (colchonMovimientos.length === 0) {
    wrap.innerHTML = '<div class="colchon-empty">Sin movimientos todavía.</div>'
    return
  }

  wrap.innerHTML = `
    <table class="colchon-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th style="text-align:right">Monto</th><th></th></tr></thead>
      <tbody>
        ${colchonMovimientos.map(m => {
          const esEntrada = m.tipo === 'entrada'
          const clase    = esEntrada ? 'monto-entrada' : 'monto-retirada'
          const etiqueta = esEntrada ? '↑ Entrada' : '↓ Retirada'
          const signo    = esEntrada ? '+' : '-'
          return `<tr class="${m.activo ? '' : 'fila-inactiva'}">
            <td>${fmtDiaColchon(m.fecha)}</td>
            <td>${m.descripcion || '—'}<div class="colchon-tag ${clase}">${etiqueta}</div></td>
            <td class="monto ${clase}">${signo}${fmt(m.monto)}</td>
            <td class="colchon-acciones">
              <span class="switch-sm ${m.activo ? 'on' : ''}" onclick="toggleColchonActivo('${m.id}')"></span>
              <span class="colchon-btn" onclick="abrirModalEditarColchon('${m.id}')">✏️</span>
              <span class="colchon-btn" onclick="eliminarColchon('${m.id}')">🗑</span>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  `
}

async function toggleColchonActivo(id) {
  const m = colchonMovimientos.find(x => String(x.id) === String(id))
  if (!m) return
  const { error } = await dbClient.from('colchon_movimientos')
    .update({ activo: !m.activo })
    .eq('id', id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al actualizar', 'err'); return }
  m.activo = !m.activo
  renderColchon()
}

async function eliminarColchon(id) {
  if (!confirm('¿Eliminar este movimiento?')) return
  const { error } = await dbClient.from('colchon_movimientos')
    .delete().eq('id', id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error al eliminar', 'err'); return }
  colchonMovimientos = colchonMovimientos.filter(x => String(x.id) !== String(id))
  toast('Movimiento eliminado')
  renderColchon()
}

function abrirModalColchon() {
  document.getElementById('col-descripcion').value = ''
  document.getElementById('col-monto').value = ''
  document.getElementById('modal-colchon').classList.add('visible')
}

function cerrarModalColchon() {
  document.getElementById('modal-colchon').classList.remove('visible')
}

async function guardarColchon() {
  const descripcion = document.getElementById('col-descripcion').value.trim()
  const monto        = parseFloat(document.getElementById('col-monto').value)

  if (isNaN(monto) || monto <= 0) { toast('Completa el monto', 'err'); return }

  const fecha = new Date().toISOString().split('T')[0]
  const { data, error } = await dbClient.from('colchon_movimientos')
    .insert({ usuario_id: window.currentUserId, fecha, descripcion, monto, tipo: 'entrada', activo: true })
    .select()
  if (error) { toast('Error: ' + error.message, 'err'); return }

  colchonMovimientos.unshift(data[0])
  cerrarModalColchon()
  toast('Movimiento guardado ✓')
  renderColchon()
}

function abrirModalEditarColchon(id) {
  const m = colchonMovimientos.find(x => String(x.id) === String(id))
  if (!m) return
  colchonEditando = id
  document.getElementById('ecol-tipo').value = m.tipo
  document.getElementById('ecol-fecha').value = (m.fecha || '').substring(0, 10)
  document.getElementById('ecol-descripcion').value = m.descripcion || ''
  document.getElementById('ecol-monto').value = m.monto
  document.getElementById('modal-editar-colchon').classList.add('visible')
}

function cerrarModalEditarColchon() {
  document.getElementById('modal-editar-colchon').classList.remove('visible')
  colchonEditando = null
}

async function guardarEdicionColchon() {
  if (!colchonEditando) return
  const tipo        = document.getElementById('ecol-tipo').value
  const fecha       = document.getElementById('ecol-fecha').value
  const descripcion = document.getElementById('ecol-descripcion').value.trim()
  const monto       = parseFloat(document.getElementById('ecol-monto').value)

  if (!fecha || isNaN(monto) || monto <= 0) { toast('Completa fecha y monto', 'err'); return }

  const { error } = await dbClient.from('colchon_movimientos')
    .update({ tipo, fecha, descripcion, monto })
    .eq('id', colchonEditando).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error: ' + error.message, 'err'); return }

  const m = colchonMovimientos.find(x => String(x.id) === String(colchonEditando))
  if (m) { m.tipo = tipo; m.fecha = fecha; m.descripcion = descripcion; m.monto = monto }

  cerrarModalEditarColchon()
  toast('Movimiento actualizado ✓')
  renderColchon()
}

document.getElementById('modal-colchon').addEventListener('click', function(e) { if (e.target === this) cerrarModalColchon() })
document.getElementById('modal-editar-colchon').addEventListener('click', function(e) { if (e.target === this) cerrarModalEditarColchon() })
document.getElementById('modal-editar-meta').addEventListener('click', function(e) { if (e.target === this) cerrarModalEditarMeta() })

cargarColchon()

function toggleBloque(nombre) {
  const detalle  = document.getElementById('detalle-' + nombre)
  const chevron  = document.getElementById('chevron-' + nombre)
  const abriendo = detalle.style.display !== 'block'
  detalle.style.display = abriendo ? 'block' : 'none'
  chevron.classList.toggle('abierto', abriendo)
}

let ingresosOriginal = []

async function cargarIngresos() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve() }
      }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const hoy = new Date()
  const inicioMes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
  const [{ data, error }, { data: budgetRow }] = await Promise.all([
    dbClient.from('ingresos').select('id, concepto, tipo, monto, fecha')
      .eq('usuario_id', window.currentUserId).gte('fecha', inicioMes),
    dbClient.from('user_budget_mode').select('ingresos_override')
      .eq('user_id', window.currentUserId).maybeSingle()
  ])

  if (error || !data) return
  ingresosOriginal = data
  renderIngresos(budgetRow?.ingresos_override ?? null)
}

function renderIngresos(ingresosOverride) {
  const inp = document.getElementById('p-ingresos-total')
  if (ingresosOverride !== null && ingresosOverride !== undefined) {
    inp.value = ingresosOverride
  } else {
    const suma = ingresosOriginal.reduce((s, r) => s + parseFloat(r.monto || 0), 0)
    inp.value = suma > 0 ? +suma.toFixed(2) : ''
  }
  inp.addEventListener('input', () => {
    const val = inp.value === '' ? null : parseFloat(inp.value)
    dbClient.from('user_budget_mode').upsert(
      { user_id: window.currentUserId, ingresos_override: val, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
    actualizarPlanificador()
  })
  inp.addEventListener('focus', function() { this.select() })
  actualizarPlanificador()
  renderIngresosMovs()
}

function renderIngresosMovs() {
  const cont = document.getElementById('ingresos-movs-lista')
  if (!cont) return
  if (ingresosOriginal.length === 0) {
    cont.innerHTML = '<div class="cat-movs-empty">Sin ingresos este mes</div>'
    return
  }
  const sorted = [...ingresosOriginal].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  cont.innerHTML = sorted.map(r => {
    const nombre = (r.concepto || 'Ingreso').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    const fecha = _diaMesSeg(r.fecha)
    const monto = fmt(r.monto)
    return `
      <div class="cat-mov-item">
        <div class="cm-icon">💰</div>
        <div class="cm-info">
          <div class="cm-nombre">${nombre}</div>
          <div class="cm-fecha">${fecha}</div>
        </div>
        <div class="cm-monto cm-verde">${monto}</div>
      </div>`
  }).join('')
}

let _pendingReset = null
function pedirConfirmacionReset(cb) {
  _pendingReset = cb
  document.getElementById('modal-reset').classList.add('visible')
}
function confirmarReset() {
  const cb = _pendingReset
  cerrarModalReset()
  if (cb) cb()
}
function cerrarModalReset() {
  document.getElementById('modal-reset').classList.remove('visible')
  _pendingReset = null
}
document.getElementById('modal-reset').addEventListener('click', function(e) { if (e.target === this) cerrarModalReset() })

function restablecerIngresos() {
  dbClient.from('user_budget_mode').upsert(
    { user_id: window.currentUserId, ingresos_override: null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  )
  const inp = document.getElementById('p-ingresos-total')
  const suma = ingresosOriginal.reduce((s, r) => s + parseFloat(r.monto || 0), 0)
  inp.value = suma > 0 ? suma.toFixed(2) : ''
  actualizarPlanificador()
}

function totalIngresos() {
  return parseFloat(document.getElementById('p-ingresos-total').value) || 0
}

let gastosOriginal = {}

async function cargarGastos() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve() }
      }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const uid = window.currentUserId

  // --- INICIO: copiado tal cual de fetchDatos() en mifinanza-estadisticas-v2.html ---
  const MESES_LABELS  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const [
    { data: gastos,  error: errG },
    { data: ingresos, error: errI },
    { data: fijos,   error: errF }
  ] = await Promise.all([
    dbClient.from('gastos').select('id, fecha, monto, categoria, descripcion').eq('usuario_id', uid).order('fecha', { ascending: true }),
    dbClient.from('ingresos').select('fecha, monto').eq('usuario_id', uid).order('fecha', { ascending: true }),
    dbClient.from('gastos_fijos').select('id, monto, categoria, nombre, fecha_inicio, fecha_fin, dia_del_mes').eq('usuario_id', uid)
  ])

  if (errG || errI || errF) return

  const mapa = {}

  ingresos.forEach(r => {
    const key = r.fecha.substring(0, 7)
    if (!mapa[key]) mapa[key] = { ingresos: 0, gastos: 0, cats: {}, movs: {} }
    mapa[key].ingresos += parseFloat(r.monto || 0)
  })

  gastos.forEach(r => {
    const key = r.fecha.substring(0, 7)
    if (!mapa[key]) mapa[key] = { ingresos: 0, gastos: 0, cats: {}, movs: {} }
    mapa[key].gastos += parseFloat(r.monto || 0)
    const cat = r.categoria || 'Otros'
    mapa[key].cats[cat] = (mapa[key].cats[cat] || 0) + parseFloat(r.monto || 0)
    if (!mapa[key].movs[cat]) mapa[key].movs[cat] = []
    mapa[key].movs[cat].push({ id: r.id, tipo: 'gasto', label: r.descripcion || cat, fecha: r.fecha, monto: parseFloat(r.monto || 0), categoria: cat })
  })

  const mesFin = new Date().toISOString().substring(0, 7)
  ;(fijos || []).forEach(f => {
    const desde = f.fecha_inicio ? f.fecha_inicio.substring(0, 7) : null
    if (!desde) return
    const hasta = f.fecha_fin ? f.fecha_fin.substring(0, 7) : mesFin
    const cat   = f.categoria || 'Otros'
    const monto = parseFloat(f.monto || 0)
    Object.keys(mapa).forEach(key => {
      if (key >= desde && key <= hasta) {
        mapa[key].gastos += monto
        mapa[key].cats[cat] = (mapa[key].cats[cat] || 0) + monto
        const [kAnio, kMes] = key.split('-').map(Number)
        const ultimoDia = new Date(kAnio, kMes, 0).getDate()
        const dia = Math.min(f.dia_del_mes || 1, ultimoDia)
        const fechaFijo = `${key}-${String(dia).padStart(2, '0')}`
        if (!mapa[key].movs[cat]) mapa[key].movs[cat] = []
        mapa[key].movs[cat].push({ id: f.id, tipo: 'fijo', label: f.nombre || cat, fecha: fechaFijo, monto, categoria: cat })
      }
    })
  })

  const datosMensuales = Object.entries(mapa)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, val]) => {
      const [anio, mesNum] = key.split('-').map(Number)
      return {
        key,
        mes: MESES_LABELS[mesNum - 1],
        mesNombre: MESES_NOMBRES[mesNum - 1],
        mesNum, anio,
        ingresos: Math.round(val.ingresos * 100) / 100,
        gastos:   Math.round(val.gastos   * 100) / 100,
        cats:     val.cats,
        movs:     val.movs
      }
    })
  // --- FIN: copiado tal cual de fetchDatos() en mifinanza-estadisticas-v2.html ---

  const mesActual = new Date().toISOString().substring(0, 7)
  const mesesCerrados = datosMensuales.filter(d => d.key !== mesActual).slice(0, 3)
  const numMeses = mesesCerrados.length || 1
  ahorroRealMedio = mesesCerrados.length ? mesesCerrados.reduce((t, d) => t + d.ingresos - d.gastos, 0) / mesesCerrados.length : null
  mesesBase = mesesCerrados.map(d => d.mes)

  console.log('[Planificador] mesActual (excluido):', mesActual)
  console.log('[Planificador] mesesCerrados:', JSON.stringify(mesesCerrados.map(d => d.key)))

  const sumasPorCategoria = {}
  mesesCerrados.forEach(d => {
    Object.entries(d.cats).forEach(([cat, val]) => {
      sumasPorCategoria[cat] = (sumasPorCategoria[cat] || 0) + val
    })
  })

  console.log('[Planificador] sumasPorCategoria:', JSON.stringify(sumasPorCategoria))

  gastosOriginal = {}
  Object.keys(sumasPorCategoria).forEach(cat => {
    gastosOriginal[cat] = sumasPorCategoria[cat] / numMeses
  })

  console.log('[Planificador] gastosOriginal:', JSON.stringify(gastosOriginal))

  await cargarGastosGuardados()
  await cargarGruposPlan()
  renderGastos()
}

let categoriaTipos = {}
let categoriaFijos = {}

async function cargarTipos() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); resolve() } }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const { data, error } = await dbClient.from('categoria_tipo').select('categoria, tipo, es_fijo').eq('user_id', window.currentUserId)
  if (error) return
  categoriaTipos = {}
  categoriaFijos = {}
  ;(data || []).forEach(r => {
    categoriaTipos[r.categoria] = r.tipo
    if (r.es_fijo) categoriaFijos[r.categoria] = true
  })
  aplicarTiposUI()
}

async function setTipo(cat, tipo) {
  if (categoriaTipos[cat] === tipo) return
  categoriaTipos[cat] = tipo
  aplicarTiposUI()
  reordenarFilas(cat)
  actualizarAnalisis()
  if (!window.currentUserId) return
  await dbClient.from('categoria_tipo').upsert({ user_id: window.currentUserId, categoria: cat, tipo }, { onConflict: 'user_id,categoria' })
}

async function toggleNecesario(cat) {
  const nuevoTipo = (categoriaTipos[cat] ?? 'opcional') === 'necesario' ? 'opcional' : 'necesario'
  categoriaTipos[cat] = nuevoTipo
  aplicarTiposUI()
  actualizarAnalisis()
  if (!window.currentUserId) return
  await dbClient.from('categoria_tipo').upsert(
    { user_id: window.currentUserId, categoria: cat, tipo: nuevoTipo, es_fijo: !!categoriaFijos[cat] },
    { onConflict: 'user_id,categoria' }
  )
}

let _redistribTodas     = []
let _redistribOrigenIdx = -1

function abrirRedistrib(idx) {
  _redistribOrigenIdx = idx
  const origen = _redistribTodas[idx]
  if (!origen) return
  const destinos = _redistribTodas.filter(t => !t.esFijo && t.diff < 0 && t !== origen && t.cat)
  const destFilas = destinos.length === 0
    ? '<div class="rdist-empty">Sin categorías con margen disponible</div>'
    : destinos.map(t => {
        const tIdx = _redistribTodas.indexOf(t)
        const libre = Math.abs(t.diff)
        return `<div class="rdist-dest-row">
          <div class="rdist-dest-info">
            <div class="rdist-dest-name">${t.label}</div>
            <div class="rdist-dest-libre" id="rdist-libre-${tIdx}" data-base="${libre.toFixed(2)}">${fmt(libre)} libre</div>
          </div>
          <div class="rdist-dest-inputwrap">
            <input class="rdist-input" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00"
                   data-rdist-idx="${tIdx}" oninput="rdistActualizarMargen()">
            <span class="rdist-euro">€</span>
          </div>
        </div>`
      }).join('')
  const exceso = Math.abs(origen.diff)
  document.getElementById('rdist-modal-inner').innerHTML = `
    <div class="rdist-top-row">
      <span class="rdist-top-cat">${origen.label}</span>
      <span class="rdist-top-pill">+${fmt(exceso)} pasado</span>
    </div>
    <div class="rdist-section-lbl">Repartir exceso en</div>
    <div class="rdist-origen-row">
      <span class="rdist-origen-icon">📌</span>
      <span class="rdist-origen-name">${origen.label}</span>
      <span class="rdist-origen-exc">${fmt(exceso)} de exceso</span>
    </div>
    <div class="rdist-sep"></div>
    <div class="rdist-section-lbl">¿Dónde lo absorbes?</div>
    ${destFilas}
    <div class="rdist-progress-wrap">
      <div class="rdist-progress-top">
        <span class="rdist-progress-lbl">Repartido</span>
        <span class="rdist-progress-nums" id="rdist-prog-nums">${fmt(0)} / ${fmt(exceso)}</span>
      </div>
      <div class="rdist-progress-bar"><div class="rdist-progress-fill" id="rdist-prog-fill" style="width:0%"></div></div>
    </div>
    <button class="rdist-confirmar-btn" onclick="pedirConfirmRedistrib()">Confirmar traspaso</button>
  `
  document.getElementById('rdist-modal').classList.add('rdist-open')
}

// Un toque: el exceso de las categorías pasadas se cubre con lo que sobra en las demás (proporcional al margen)
let _antesCubrir = null
async function cubrirExceso(idxs) {
  if (!window.currentUserId) return
  const origenes = idxs.map(i => _redistribTodas[i]).filter(t => t && t.cat && t.diff > 0)
  const destinos = _redistribTodas.filter(t => t.cat && !t.esFijo && t.diff < 0)
  const exceso = origenes.reduce((s, t) => s + t.diff, 0), libre = destinos.reduce((s, t) => s - t.diff, 0)
  if (!origenes.length) return
  if (libre < 1) { toast('No queda margen en otras categorías: este mes toca ajustar el plan', 'err', 3500); return }
  const parte = Math.min(1, libre / exceso)
  const plan = {}
  destinos.forEach(t => { plan[t.cat] = t.estimado - (-t.diff) * Math.min(1, exceso / libre) })
  origenes.forEach(t => { plan[t.cat] = t.estimado + t.diff * parte })
  _antesCubrir = [...origenes, ...destinos].map(t => [t.cat, t.estimado])
  await guardarPlanCats(plan)
  const cubierto = Math.min(exceso, libre)
  avisoDeshacer(parte < 1 ? `Cubiertos ${fmt(cubierto)} de ${fmt(exceso)}: no había más margen` : `Cubiertos ${fmt(cubierto)} con lo que te sobraba`)
}
async function deshacerCubrir() {
  if (!_antesCubrir) return
  await guardarPlanCats(Object.fromEntries(_antesCubrir))
  _antesCubrir = null
  document.getElementById('aviso-deshacer')?.classList.remove('ver')
}
async function guardarPlanCats(plan) {
  const ahora = new Date().toISOString()
  Object.entries(plan).forEach(([cat, monto]) => {
    const row = [...document.querySelectorAll('.var-row')].find(r => r._planCat === cat)
    const inp = row?.querySelector('.variable-input'); if (inp) inp.value = Math.round(monto)
  })
  await dbClient.from('user_gasto_plan').upsert(Object.entries(plan).map(([categoria, monto]) => ({ user_id: window.currentUserId, categoria, monto: Math.round(monto), updated_at: ahora })), { onConflict: 'user_id,categoria' })
  actualizarPlanificador()
}
// Aviso abajo con «Deshacer» (en vez de una alerta)
function avisoDeshacer(msg) {
  let a = document.getElementById('aviso-deshacer')
  if (!a) {
    a = document.createElement('div'); a.id = 'aviso-deshacer'; a.className = 'aviso-deshacer'; a.setAttribute('role', 'status')
    a.innerHTML = '<span></span><button type="button" onclick="deshacerCubrir()">Deshacer</button>'
    document.body.appendChild(a)
  }
  a.querySelector('span').textContent = msg
  a.classList.add('ver')
  clearTimeout(a._t); a._t = setTimeout(() => a.classList.remove('ver'), 6000)
}

function cerrarRedistrib() {
  document.getElementById('rdist-modal').classList.remove('rdist-open')
  _redistribOrigenIdx = -1
}

function rdistActualizarMargen() {
  const origen = _redistribTodas[_redistribOrigenIdx]
  if (!origen) return
  let total = 0
  document.querySelectorAll('.rdist-input').forEach(inp => {
    const amt = parseFloat(inp.value) || 0
    const tIdx = parseInt(inp.dataset.rdistIdx)
    const libreEl = document.getElementById('rdist-libre-' + tIdx)
    if (libreEl) {
      const base = parseFloat(libreEl.dataset.base || '0')
      const restante = base - amt
      libreEl.textContent = fmt(Math.abs(restante)) + (restante < 0 ? ' excedido' : ' libre')
      libreEl.classList.toggle('rdist-agotado', restante < 0)
    }
    total += amt
  })
  const exceso = Math.abs(origen.diff)
  const pct = exceso > 0 ? Math.min(100, (total / exceso) * 100) : 0
  const numsEl = document.getElementById('rdist-prog-nums')
  const fillEl = document.getElementById('rdist-prog-fill')
  if (numsEl) numsEl.textContent = fmt(total) + ' / ' + fmt(exceso)
  if (fillEl) fillEl.style.width = pct.toFixed(1) + '%'
}

function pedirConfirmRedistrib() {
  document.getElementById('rdist-confirm-overlay').classList.add('rdist-confirm-open')
}

function cerrarConfirmRedistrib() {
  document.getElementById('rdist-confirm-overlay').classList.remove('rdist-confirm-open')
}

async function ejecutarConfirmRedistrib() {
  cerrarConfirmRedistrib()
  await confirmarRedistrib()
}

async function confirmarRedistrib() {
  if (!window.currentUserId || _redistribOrigenIdx < 0) return
  const origen = _redistribTodas[_redistribOrigenIdx]
  if (!origen || !origen.cat) return
  const inputs = [...document.querySelectorAll('.rdist-input')]
  let totalTransferido = 0
  const upserts = []
  for (const inp of inputs) {
    const amt = parseFloat(inp.value) || 0
    if (amt <= 0) continue
    const dest = _redistribTodas[parseInt(inp.dataset.rdistIdx)]
    if (!dest?.cat) continue
    const newMonto = Math.max(0, dest.estimado - amt)
    const destRow = [...document.querySelectorAll('.var-row')].find(r => r._planCat === dest.cat)
    if (destRow) { const di = destRow.querySelector('.variable-input'); if (di) di.value = Math.round(newMonto) }
    upserts.push({ user_id: window.currentUserId, categoria: dest.cat, monto: newMonto, updated_at: new Date().toISOString() })
    totalTransferido += amt
  }
  if (totalTransferido > 0) {
    const newOrigenMonto = origen.estimado + totalTransferido
    const origenRow = [...document.querySelectorAll('.var-row')].find(r => r._planCat === origen.cat)
    if (origenRow) { const oi = origenRow.querySelector('.variable-input'); if (oi) oi.value = Math.round(newOrigenMonto) }
    upserts.push({ user_id: window.currentUserId, categoria: origen.cat, monto: newOrigenMonto, updated_at: new Date().toISOString() })
  }
  if (upserts.length > 0) {
    await dbClient.from('user_gasto_plan').upsert(upserts, { onConflict: 'user_id,categoria' })
  }
  cerrarRedistrib()
  actualizarPlanificador()
  toast('Gastos estimados actualizados', 'ok', 3000)
}

function toggleListaOculto() {
  _listaOcultoOpen = !_listaOcultoOpen
  const body = document.getElementById('sc-lista-oculto-body')
  const chev = document.getElementById('sc-lista-oculto-chev')
  if (body) body.style.maxHeight = _listaOcultoOpen ? body.scrollHeight + 'px' : '0'
  if (chev) chev.style.transform = _listaOcultoOpen ? 'rotate(180deg)' : ''
}

async function toggleEsFijo(cat) {
  const nuevoValor = !categoriaFijos[cat]
  if (nuevoValor) categoriaFijos[cat] = true
  else delete categoriaFijos[cat]
  renderTablaComparativa()
  if (!window.currentUserId) return
  await dbClient.from('categoria_tipo').upsert(
    { user_id: window.currentUserId, categoria: cat, tipo: categoriaTipos[cat] || 'opcional', es_fijo: nuevoValor },
    { onConflict: 'user_id,categoria' }
  )
}

function aplicarTipoRow(row) {
  const esNec = categoriaTipos[row._planCat] === 'necesario'
  const label = row.querySelector('.vn-toggle-label')
  const sw    = row.querySelector('.vn-toggle-sw')
  const knob  = row.querySelector('.vn-toggle-knob')
  if (label) label.classList.toggle('vn-on', esNec)
  if (sw)    sw.classList.toggle('vn-on', esNec)
  if (knob)  knob.classList.toggle('vn-on', esNec)
}

function aplicarTiposUI() {
  document.querySelectorAll('.var-row').forEach(row => aplicarTipoRow(row))
  _planGrupos.forEach(grupo => {
    const el = document.querySelector('.var-group[data-grupo-id="' + grupo.id + '"]')
    if (!el) return
    const catsValidas = grupo.categorias.filter(c => Object.prototype.hasOwnProperty.call(gastosOriginal, c))
    const necCount = catsValidas.filter(c => (categoriaTipos[c] ?? 'opcional') === 'necesario').length
    const tipoGrupo = necCount > catsValidas.length / 2 ? 'necesario' : 'opcional'
    el.classList.toggle('tipo-necesario', tipoGrupo === 'necesario')
    el.classList.toggle('tipo-opcional',  tipoGrupo === 'opcional')
  })
  actualizarResumenTipos()
}

function reordenarFilas(catCambiada = null) {
  const cont = document.getElementById('gastos-lista-plan')
  if (!cont) return
  const tipoOrden = { necesario: 0, opcional: 1 }
  function getTipoEl(el) {
    if (el.classList.contains('var-row')) return categoriaTipos[el._planCat] ?? 'opcional'
    const grupo = _planGrupos.find(g => g.id === el.dataset.grupoId)
    if (!grupo) return 'opcional'
    const catsValidas = grupo.categorias.filter(c => Object.prototype.hasOwnProperty.call(gastosOriginal, c))
    const necCount = catsValidas.filter(c => (categoriaTipos[c] ?? 'opcional') === 'necesario').length
    return necCount > catsValidas.length / 2 ? 'necesario' : 'opcional'
  }
  const items = [...cont.querySelectorAll(':scope > .var-row, :scope > .var-group')]
  items.sort((a, b) => {
    const tipoA = tipoOrden[getTipoEl(a)] ?? 2
    const tipoB = tipoOrden[getTipoEl(b)] ?? 2
    if (tipoA !== tipoB) return tipoA - tipoB
    if (catCambiada !== null) {
      const aChanged = a._planCat === catCambiada
      const bChanged = b._planCat === catCambiada
      if (aChanged && !bChanged) return 1
      if (bChanged && !aChanged) return -1
    }
    return 0
  })
  items.forEach(r => cont.appendChild(r))
  if (window.currentUserId) {
    try {
      const keys = items.map(el => el._planCat || ('__grupo_' + el.dataset.grupoId)).filter(Boolean)
      localStorage.setItem('mf_orden_plan_' + window.currentUserId, JSON.stringify(keys))
    } catch(e) {}
  }
  const btnCerrar = cont.querySelector(':scope > .btn-cerrar-gastos')
  if (btnCerrar) cont.appendChild(btnCerrar)
}

function actualizarResumenTipos() {
  const el = document.getElementById('resumen-tipos')
  if (el) el.style.display = 'none'
}

let _gastosDebounceTimer = null
function guardarGastosLocal() {
  clearTimeout(_gastosDebounceTimer)
  _gastosDebounceTimer = setTimeout(() => {
    if (!window.currentUserId) return
    const rows = [...document.querySelectorAll('.var-row')]
    const upserts = rows
      .filter(r => r._planCat && r.querySelector('.variable-input'))
      .map(r => ({
        user_id:  window.currentUserId,
        categoria: r._planCat,
        monto:    parseFloat(r.querySelector('.variable-input').value) || 0,
        updated_at: new Date().toISOString()
      }))
    if (upserts.length > 0) {
      dbClient.from('user_gasto_plan').upsert(upserts, { onConflict: 'user_id,categoria' }).then(() => {})
    }
  }, 300)
}

let _gastosGuardados = {}
let _planGrupos = []

async function cargarGruposPlan() {
  if (!window.currentUserId) return
  // Supabase primary — cross-device, survives private browsing
  const { data } = await dbClient.from('user_preferences')
    .select('grupos_plan').eq('user_id', window.currentUserId).maybeSingle()
  if (data?.grupos_plan) {
    _planGrupos = Array.isArray(data.grupos_plan) ? data.grupos_plan : []
    return
  }
  // localStorage fallback
  try {
    const raw = localStorage.getItem('mf_grupos_plan_' + window.currentUserId)
    if (raw) _planGrupos = JSON.parse(raw)
  } catch(e) {}
}

function guardarGruposPlan() {
  if (!window.currentUserId) return
  // localStorage (fast, immediate)
  try {
    localStorage.setItem('mf_grupos_plan_' + window.currentUserId, JSON.stringify(_planGrupos))
  } catch(e) {}
  // Supabase (persistent, cross-device) — must call .then() to fire in supabase-js v2
  dbClient.from('user_preferences')
    .upsert({ user_id: window.currentUserId, grupos_plan: _planGrupos, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(() => {})
}

let _editandoGrupoId = null

function abrirModalGrupo(idExistente) {
  _editandoGrupoId = idExistente || null
  const overlay  = document.getElementById('grupo-modal-overlay')
  const titulo   = document.getElementById('grupo-modal-titulo')
  const emojiInp = document.getElementById('gm-emoji')
  const nombreInp = document.getElementById('gm-nombre')
  const catsList = document.getElementById('gm-cats-list')
  const grupo = idExistente ? _planGrupos.find(g => g.id === idExistente) : null
  titulo.textContent = idExistente ? 'Editar grupo' : 'Crear grupo'
  emojiInp.value = grupo?.emoji || ''
  nombreInp.value = grupo?.nombre || 'Gastos Varios'
  const otrasAgrupadas = new Set(_planGrupos
    .filter(g => g.id !== idExistente)
    .flatMap(g => g.categorias))
  const disponibles = Object.keys(gastosOriginal)
    .sort((a, b) => gastosOriginal[b] - gastosOriginal[a])
    .filter(c => !otrasAgrupadas.has(c))
  catsList.innerHTML = disponibles.map(cat => {
    const checked = grupo?.categorias.includes(cat) ? 'checked' : ''
    const partes = cat.trim().split(' ')
    const em = partes[0]
    const nb = partes.slice(1).join(' ') || cat
    const val = cat.replace(/"/g, '&quot;')
    return `<label class="gm-cat-option"><input type="checkbox" value="${val}" ${checked}><span>${em} ${nb}</span></label>`
  }).join('')
  overlay.style.display = 'flex'
  setTimeout(() => nombreInp.focus(), 80)
}

function cerrarModalGrupo() {
  document.getElementById('grupo-modal-overlay').style.display = 'none'
  _editandoGrupoId = null
}

function sincronizarGastosDeDOM() {
  document.querySelectorAll('.var-row').forEach(row => {
    const inp = row.querySelector('.variable-input')
    if (row._planCat && inp) _gastosGuardados[row._planCat] = parseFloat(inp.value) || 0
  })
}

function guardarModalGrupo() {
  const emoji  = document.getElementById('gm-emoji').value.trim() || '🗂️'
  const nombre = document.getElementById('gm-nombre').value.trim()
  if (!nombre) { document.getElementById('gm-nombre').focus(); return }
  const categorias = [...document.querySelectorAll('#gm-cats-list input[type=checkbox]:checked')]
    .map(cb => cb.value)
  if (categorias.length === 0) return
  sincronizarGastosDeDOM()
  if (_editandoGrupoId) {
    const g = _planGrupos.find(x => x.id === _editandoGrupoId)
    if (g) { g.emoji = emoji; g.nombre = nombre; g.categorias = categorias }
  } else {
    _planGrupos.push({ id: 'g' + Date.now(), emoji, nombre, categorias })
  }
  guardarGruposPlan()
  cerrarModalGrupo()
  renderGastos()
}

function editarGrupo(id) { abrirModalGrupo(id) }

function borrarGrupo(id) {
  sincronizarGastosDeDOM()
  _planGrupos = _planGrupos.filter(g => g.id !== id)
  guardarGruposPlan()
  renderGastos()
}

async function cargarGastosGuardados() {
  if (!window.currentUserId) return
  const { data } = await dbClient.from('user_gasto_plan')
    .select('categoria, monto').eq('user_id', window.currentUserId)
  if (data) data.forEach(r => { _gastosGuardados[r.categoria] = r.monto })
}

function renderGastos() {
  const cont = document.getElementById('gastos-lista-plan')
  cont.innerHTML = ''
  const guardado  = _gastosGuardados
  const enGrupos  = new Set(_planGrupos.flatMap(g => g.categorias))
  const allItems  = []

  function _buildRow(cat) {
    const partes  = cat.trim().split(' ')
    const emoji   = partes[0]
    const nombre  = partes.slice(1).join(' ') || cat
    const val     = guardado[cat] !== undefined ? Math.round(guardado[cat]) : Math.round(gastosOriginal[cat] || 0)
    const catEsc  = cat.replace(/'/g, "\\'")
    const row     = document.createElement('div')
    row.className = 'var-row'
    row._planCat  = cat
    const mediaStr = fmt(Math.round(gastosOriginal[cat] || 0))
    row.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
        <span class="var-emoji">${emoji}</span>
        <span style="font-size:13px;font-weight:500;color:var(--text);">${nombre}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span class="var-promedio" style="flex:1;font-size:11px;">media ${mediaStr}</span>
        <label class="vn-toggle-wrap" onclick="event.stopPropagation();toggleNecesario('${catEsc}')">
          <span class="vn-toggle-label">Necesario</span>
          <span class="vn-toggle-sw"><span class="vn-toggle-knob"></span></span>
        </label>
        <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
          <div class="var-spin-btns">
            <button class="btn-spin btn-spin-minus" type="button" aria-label="Disminuir">−</button>
          </div>
          <input class="var-input variable-input" type="number" inputmode="decimal" enterkeyhint="done" value="${val}">
          <div class="var-spin-btns">
            <button class="btn-spin btn-spin-plus" type="button" aria-label="Aumentar">+</button>
          </div>
        </div>
      </div>
    `
    return row
  }

  function _buildGroupSubRow(cat, guardado, gastosOriginal) {
    const partes = cat.trim().split(' ')
    const emoji  = partes[0]
    const nombre = partes.slice(1).join(' ') || cat
    const val    = guardado[cat] !== undefined ? Math.round(guardado[cat]) : Math.round(gastosOriginal[cat] || 0)
    const row    = document.createElement('div')
    row.className = 'var-row vg-sub-row'
    row._planCat  = cat
    row.innerHTML = `
      <span class="vg-sub-emoji">${emoji}</span>
      <span class="vg-sub-nombre">${nombre}</span>
      <input class="variable-input vg-sub-input" type="number" inputmode="decimal" enterkeyhint="done" value="${val}">
    `
    return row
  }

  Object.keys(gastosOriginal)
    .sort((a, b) => gastosOriginal[b] - gastosOriginal[a])
    .filter(cat => !enGrupos.has(cat))
    .forEach(cat => {
      allItems.push({ tipo: categoriaTipos[cat] ?? 'opcional', el: _buildRow(cat) })
    })

  _planGrupos.forEach(grupo => {
    const catsValidas = grupo.categorias.filter(c => Object.prototype.hasOwnProperty.call(gastosOriginal, c))
    if (catsValidas.length === 0) return
    const necCount  = catsValidas.filter(c => (categoriaTipos[c] ?? 'opcional') === 'necesario').length
    const tipoGrupo = necCount > catsValidas.length / 2 ? 'necesario' : 'opcional'

    const historicoGrupo = catsValidas.reduce((s, c) => s + (gastosOriginal[c] || 0), 0)

    const el = document.createElement('div')
    el.className = 'var-group tipo-' + tipoGrupo
    el.dataset.grupoId = grupo.id
    el.innerHTML = `
      <div class="vg-header">
        <span class="vg-emoji">${grupo.emoji}</span>
        <div class="vg-title-block">
          <span class="vg-nombre">${grupo.nombre}</span>
          <span class="vg-subtitle">Suma de ${catsValidas.length} categoría${catsValidas.length !== 1 ? 's' : ''} · Últ. meses: ${fmt(historicoGrupo)}</span>
        </div>
        <div class="vg-total-pill"><span id="vg-total-${grupo.id}">—</span></div>
      </div>
    `
    catsValidas
      .sort((a, b) => (gastosOriginal[b] || 0) - (gastosOriginal[a] || 0))
      .forEach(cat => el.appendChild(_buildGroupSubRow(cat, guardado, gastosOriginal)))

    const footer = document.createElement('div')
    footer.className = 'vg-footer'
    footer.innerHTML = `
      <button class="btn-vg-edit-full" onclick="editarGrupo('${grupo.id}')">✏️ Editar grupo</button>
      <button class="btn-vg-ungroup" onclick="borrarGrupo('${grupo.id}')">↑ Desagrupar</button>
    `
    el.appendChild(footer)

    allItems.push({ tipo: tipoGrupo, el })
  })

  let _savedOrden = []
  if (window.currentUserId) {
    try { _savedOrden = JSON.parse(localStorage.getItem('mf_orden_plan_' + window.currentUserId) || '[]') } catch(e) {}
  }
  if (_savedOrden.length > 0) {
    const _idx = Object.fromEntries(_savedOrden.map((k, i) => [k, i]))
    allItems.sort((a, b) => {
      const ka = a.el._planCat || ('__grupo_' + a.el.dataset.grupoId) || ''
      const kb = b.el._planCat || ('__grupo_' + b.el.dataset.grupoId) || ''
      return (_idx[ka] ?? 9999) - (_idx[kb] ?? 9999)
    })
  } else {
    allItems.sort((a, b) => ({ necesario: 0, opcional: 1 }[a.tipo] ?? 2) - ({ necesario: 0, opcional: 1 }[b.tipo] ?? 2))
  }
  allItems.forEach(item => cont.appendChild(item.el))

  const btnCerrar = document.createElement('button')
  btnCerrar.className = 'btn-cerrar-gastos'
  btnCerrar.textContent = '✕ Cerrar gastos'
  btnCerrar.addEventListener('click', () => {
    toggleBloque('gastos')
    document.getElementById('chevron-gastos')?.closest('.bloque-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  cont.appendChild(btnCerrar)
  aplicarTiposUI()
  actualizarPlanificador()
}

function restablecerGastos() {
  document.querySelectorAll('.var-row').forEach(row => {
    const inp = row.querySelector('.variable-input')
    if (row._planCat && inp) inp.value = Math.round(gastosOriginal[row._planCat] ?? 0)
  })
  _gastosGuardados = {}
  if (window.currentUserId) {
    dbClient.from('user_gasto_plan').delete().eq('user_id', window.currentUserId)
  }
  actualizarPlanificador()
}

function totalGastos() {
  return [...document.querySelectorAll('.variable-input')].reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0)
}

function actualizarTotalesGrupos() {
  _planGrupos.forEach(grupo => {
    const el = document.querySelector('.var-group[data-grupo-id="' + grupo.id + '"]')
    if (!el) return
    const total = [...el.querySelectorAll('.variable-input')]
      .reduce((s, inp) => s + (parseFloat(inp.value) || 0), 0)
    const span = document.getElementById('vg-total-' + grupo.id)
    if (span) span.textContent = fmt(total)
  })
}

function actualizarPlanificador() {
  const ingresos = totalIngresos()
  const gastos   = totalGastos()
  const disponible = ingresos - gastos
  document.getElementById('p-gastos-total').textContent   = fmt(gastos)
  const elDisponible = document.getElementById('p-disponible-header')
  elDisponible.textContent = fmt(disponible)
  elDisponible.classList.toggle('negativo', disponible < 0)
  actualizarTotalesGrupos()
  renderTablaComparativa()
  actualizarResumenTipos()
  actualizarAnalisis()
  renderPaso1()
  avisosSinceridad()
  renderRealismo()
}

function toggleAnalisis() {
  const body    = document.getElementById('analisis-body')
  const chevron = document.getElementById('analisis-chevron')
  const abre    = !body.classList.contains('abierto')
  body.classList.toggle('abierto', abre)
  chevron.classList.toggle('abierto', abre)
}

let metaAhorro       = 20
let vistaAnalisis    = 'pct'
let _metaAhorroLoad  = false
let _asiGastosOpen     = false
let _listaOcultoOpen   = false
const PERFILES_LABELS = { basico: 'Básico', equilibrado: 'Equilibrado', ahorrador: 'Ahorrador', personalizado: 'Personalizado' }
const PERFILES_AHORRO = {
  basico:        { ahorro: 10, necesarios: 70, opcionales: 20 },
  equilibrado:   { ahorro: 15, necesarios: 65, opcionales: 20 },
  ahorrador:     { ahorro: 25, necesarios: 60, opcionales: 15 },
  personalizado: null
}
let perfilAhorro   = 'personalizado'
let metaNecesarios = 70
let metaOpcionales = 20

async function cargarBudgetMode() {
  /* replaced by metaAhorro stored in localStorage */
}

let _floatHideTimer = null
let _focusedInput   = null

function actualizarAnalisisFloat() {
  const el = document.getElementById('analisis-float')
  if (!el) return
  const ingresos = totalIngresos()
  if (ingresos <= 0) return
  const gastos    = totalGastos()
  const saldo     = ingresos - gastos
  const pGastos   = gastos / ingresos * 100
  const pAhorro   = Math.max(0, saldo / ingresos * 100)
  const metaGastos = 100 - metaAhorro

  function col(v, meta, inv) { const d = inv ? meta - v : v - meta; return d <= 0.5 ? '#34d399' : d <= 15 ? '#f59e0b' : '#ef4444' }
  function est(v, meta, inv) { const d = inv ? meta - v : v - meta; return d <= 0.5 ? '✅' : d <= 15 ? '⚠️' : '❌' }

  const filas = [
    { label: 'Gastos 💸',  v: pGastos, meta: metaGastos, inv: false },
    { label: 'Ahorro 🏦',  v: pAhorro, meta: metaAhorro,  inv: true  },
  ]
  el.innerHTML = `
    <div class="af-title">📊 EN TIEMPO REAL</div>
    <div class="af-head" style="grid-template-columns:1fr 54px 54px 28px;">
      <span class="af-cell-label"></span>
      <span class="af-cell-val">TU CASO</span>
      <span class="af-cell-val">META</span>
      <span class="af-cell-est"></span>
    </div>
    ${filas.map(f => `
    <div class="af-row">
      <span class="af-cell-label">${f.label}</span>
      <span class="af-cell-val" style="color:${col(f.v, f.meta, f.inv)}">${Math.round(f.v)} %</span>
      <span class="af-cell-val" style="color:var(--subtext)">${f.meta} %</span>
      <span class="af-cell-est">${est(f.v, f.meta, f.inv)}</span>
    </div>`).join('')}`
}

function mostrarAnalisisFloat(inp) {
  clearTimeout(_floatHideTimer)
  const panelEl = document.getElementById('analisis-body')
  if (panelEl?.classList.contains('abierto')) {
    const r = panelEl.getBoundingClientRect()
    if (r.top < window.innerHeight && r.bottom > 0) return
  }
  _focusedInput = inp || null
  actualizarAnalisisFloat()
  const el = document.getElementById('analisis-float')
  if (!el) return
  if (inp) {
    const row  = inp.closest('.var-row')
    const rect = (row || inp).getBoundingClientRect()
    const elH  = el.offsetHeight || 130
    const topAbove = rect.top - elH - 10
    const topBelow = rect.bottom + 10
    el.style.top = (topAbove >= 8 ? topAbove : topBelow) + 'px'
  }
  el.classList.add('visible')
}
function ocultarAnalisisFloat() {
  _floatHideTimer = setTimeout(() => {
    document.getElementById('analisis-float')?.classList.remove('visible')
  }, 150)
}

function actualizarAnalisis() {
  if (!_metaAhorroLoad && window.currentUserId) {
    _metaAhorroLoad = true
    try {
      const s = localStorage.getItem('mf_meta_ahorro_' + window.currentUserId)
      if (s !== null) metaAhorro = Math.max(5, Math.min(50, parseInt(s) || 20))
    } catch(e) {}
  }

  renderPlanExtras()
  renderPropuesta()
  const summaryEl = document.getElementById('analisis-summary')
  const cont      = document.getElementById('analisis-contenido')
  if (!summaryEl || !cont) return

  summaryEl.innerHTML = '<span style="font-size:14px;font-weight:600;">🧭 Plan Mensual</span>'

  const ingresos = totalIngresos()
  if (ingresos <= 0) {
    cont.innerHTML = ''
    return
  }

  const gastos     = totalGastos()
  const saldo      = ingresos - gastos
  const pGastos    = gastos / ingresos * 100
  const pAhorro    = saldo  / ingresos * 100
  const metaGastos = 100 - metaAhorro
  const metaAhorro_eur = ingresos * metaAhorro / 100

  // Don't destroy the body while the user is typing in the meta input
  const existingMetaInp = cont.querySelector('.asi-meta-inp')
  if (existingMetaInp && document.activeElement === existingMetaInp) return

  const isEur = vistaAnalisis === 'eur'
  const pAhorroPos = Math.max(0, pAhorro)

  let gastosNec = 0, gastosOpc = 0
  document.querySelectorAll('.variable-input').forEach(inp => {
    const row = inp.closest('.var-row')
    const cat = row?._planCat
    const val = parseFloat(inp.value) || 0
    if (cat && (categoriaTipos[cat] ?? 'opcional') === 'necesario') gastosNec += val
    else gastosOpc += val
  })
  const tcasoNec = isEur ? fmt(gastosNec) : Math.round(gastosNec / ingresos * 100) + ' %'
  const tcasoOpc = isEur ? fmt(gastosOpc) : Math.round(gastosOpc / ingresos * 100) + ' %'
  const esPersonalizado = perfilAhorro === 'personalizado'
  const tmetaNec = esPersonalizado ? '—' : (isEur ? fmt(ingresos * metaNecesarios / 100) : metaNecesarios + ' %')
  const tmetaOpc = esPersonalizado ? '—' : (isEur ? fmt(ingresos * metaOpcionales / 100) : metaOpcionales + ' %')
  const chevRot       = _asiGastosOpen ? 'rotate(180deg)' : ''
  const gastosSubMaxH = _asiGastosOpen ? '80px' : '0'

  const tcasoGastos = isEur ? fmt(gastos) : Math.round(pGastos) + ' %'
  const tmetaGastos = isEur ? fmt(ingresos * metaGastos / 100) : metaGastos + ' %'
  const tcasoAhorro = isEur ? fmt(Math.max(0, saldo)) : Math.round(pAhorroPos) + ' %'
  const gColorClass = pGastos > metaGastos ? '#ef4444' : '#34d399'
  const aColorClass = saldo >= 0 ? '#34d399' : '#ef4444'
  const inputVal     = isEur ? Math.round(metaAhorro_eur) : metaAhorro
  const inputSymbol  = isEur ? (window.moneda || '$') : '%'
  const inputMin     = isEur ? Math.round(ingresos * 0.05) : 5
  const inputMax     = isEur ? Math.round(ingresos * 0.50) : 50
  const inputSubText = isEur ? `= ${Math.round(metaAhorro)}%` : `${fmt(metaAhorro_eur)}/mes`

  const metaAhorroRnd = Math.round(metaAhorro)
  const metaGastosRnd = 100 - metaAhorroRnd
  let tipText
  if (pGastos <= metaGastos) {
    tipText = `✅ Estás cumpliendo tu meta de ahorro del ${metaAhorroRnd}%. ¡Bien hecho!`
  } else {
    const W = metaAhorro_eur * 12
    tipText = `Si bajas al ${metaGastosRnd}% podrías ahorrar ${fmt(metaAhorro_eur)}/mes — unos ${fmt(W)} al año.`
  }

  cont.innerHTML = `
    <div class="asi-cols-header">
      <button class="asi-toggle" onclick="toggleVistaAnalisis(event)">${isEur ? '€ → %' : '% → €'}</button>
      <span class="asi-cols-tucaso">TU CASO</span>
      <div class="apd-wrap">
        <button class="apd-btn" onclick="togglePerfilDrop(event)">
          <span class="apd-dot"></span>
          <span>${PERFILES_LABELS[perfilAhorro]}</span>
          <span class="apd-chev" id="apd-chev">▾</span>
        </button>
        <div class="apd-menu" id="apd-menu">
          <button class="apd-opt${perfilAhorro==='basico'?' apd-act':''}" onclick="seleccionarPerfil('basico');event.stopPropagation()"><span class="apd-dot"></span>Básico</button>
          <button class="apd-opt${perfilAhorro==='equilibrado'?' apd-act':''}" onclick="seleccionarPerfil('equilibrado');event.stopPropagation()"><span class="apd-dot"></span>Equilibrado</button>
          <button class="apd-opt${perfilAhorro==='ahorrador'?' apd-act':''}" onclick="seleccionarPerfil('ahorrador');event.stopPropagation()"><span class="apd-dot"></span>Ahorrador</button>
          <button class="apd-opt${perfilAhorro==='personalizado'?' apd-act':''}" onclick="seleccionarPerfil('personalizado');event.stopPropagation()"><span class="apd-dot"></span>Personalizado</button>
        </div>
      </div>
    </div>
    <div class="asi-metric-row asi-gastos-row" onclick="toggleAsiGastosSub()">
      <span class="asi-metric-name">Gastos <span class="asi-gastos-chev" id="asi-gastos-chev" style="transform:${chevRot}">▾</span></span>
      <span class="asi-metric-real" style="color:${gColorClass}">${tcasoGastos}</span>
      <span class="asi-metric-meta">${tmetaGastos}</span>
    </div>
    <div class="asi-sub-wrap" id="asi-gastos-sub" style="max-height:${gastosSubMaxH}">
      <div class="asi-metric-row asi-sub-inner">
        <span class="asi-metric-name" style="color:var(--subtext)">🔒 Necesarios</span>
        <span class="asi-metric-real" style="color:var(--subtext);font-weight:600">${tcasoNec}</span>
        <span class="asi-metric-meta">${tmetaNec}</span>
      </div>
      <div class="asi-metric-row asi-sub-inner">
        <span class="asi-metric-name" style="color:var(--subtext)">✨ Opcionales</span>
        <span class="asi-metric-real" style="color:var(--subtext);font-weight:600">${tcasoOpc}</span>
        <span class="asi-metric-meta">${tmetaOpc}</span>
      </div>
    </div>
    <div class="asi-metric-row">
      <span class="asi-metric-name">Ahorro</span>
      <span class="asi-metric-real" style="color:${aColorClass}">${tcasoAhorro}</span>
      <div class="asi-metric-meta">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:2px;">
          <input class="asi-meta-inp" type="number" inputmode="decimal" enterkeyhint="done"
            min="${inputMin}" max="${inputMax}" value="${inputVal}"
            oninput="onMetaAhorroInput(this.value)"
            onblur="onMetaAhorroBlur(this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur()}"
            onclick="event.stopPropagation()"
          >${inputSymbol}
        </div>
      </div>
    </div>
    <div class="analisis-msg">💡 ${tipText}</div>
    <div style="height:10px"></div>
  `
}

function toggleVistaAnalisis(e) {
  e.stopPropagation()
  vistaAnalisis = vistaAnalisis === 'pct' ? 'eur' : 'pct'
  actualizarAnalisis()
}

function toggleAsiGastosSub() {
  _asiGastosOpen = !_asiGastosOpen
  const wrap = document.getElementById('asi-gastos-sub')
  const chev = document.getElementById('asi-gastos-chev')
  if (wrap) wrap.style.maxHeight = _asiGastosOpen ? '80px' : '0'
  if (chev) chev.style.transform = _asiGastosOpen ? 'rotate(180deg)' : ''
}

function togglePerfilDrop(e) {
  e.stopPropagation()
  const menu = document.getElementById('apd-menu')
  const chev = document.getElementById('apd-chev')
  if (!menu) return
  const open = menu.classList.toggle('apd-open')
  if (chev) chev.classList.toggle('apd-open', open)
}

async function seleccionarPerfil(nombre) {
  perfilAhorro = nombre
  const p = PERFILES_AHORRO[nombre]
  if (p) {
    metaAhorro     = p.ahorro
    metaNecesarios = p.necesarios
    metaOpcionales = p.opcionales
    try { localStorage.setItem('mf_meta_ahorro_' + window.currentUserId, metaAhorro) } catch(e) {}
  }
  actualizarAnalisis()
  if (!window.currentUserId) return
  await dbClient.from('perfil')
    .update({ perfil_presupuesto: nombre })
    .eq('usuario_id', window.currentUserId)
}

async function cargarPerfilAhorro() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); resolve() } }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const { data } = await dbClient.from('perfil')
    .select('perfil_presupuesto')
    .eq('usuario_id', window.currentUserId)
    .limit(1)
  const tipo = data?.[0]?.perfil_presupuesto
  if (tipo && Object.prototype.hasOwnProperty.call(PERFILES_AHORRO, tipo)) {
    perfilAhorro = tipo
    const p = PERFILES_AHORRO[tipo]
    if (p) {
      metaAhorro     = p.ahorro
      metaNecesarios = p.necesarios
      metaOpcionales = p.opcionales
      try { localStorage.setItem('mf_meta_ahorro_' + window.currentUserId, metaAhorro) } catch(e) {}
    }
    actualizarAnalisis()
  }
}

function onMetaAhorroInput(val) {
  perfilAhorro = 'personalizado'
  const n = parseFloat(val)
  if (!isNaN(n)) {
    if (vistaAnalisis === 'eur') {
      const ing = totalIngresos()
      if (ing > 0) metaAhorro = n / ing * 100  // convert € → %, no clamping while typing
    } else {
      metaAhorro = n  // no clamping while typing
    }
  }
  actualizarAnalisis()  // updates summary bar only (input has focus → body skipped)
}

function onMetaAhorroBlur(inp) {
  const raw = parseFloat(inp.value)
  const ing = totalIngresos()
  if (!isNaN(raw)) {
    if (vistaAnalisis === 'eur' && ing > 0) {
      const pct = raw / ing * 100
      metaAhorro = Math.max(5, Math.min(50, pct))
    } else {
      metaAhorro = Math.max(5, Math.min(50, raw || 20))
    }
  }
  perfilAhorro = 'personalizado'
  if (window.currentUserId) {
    try { localStorage.setItem('mf_meta_ahorro_' + window.currentUserId, metaAhorro) } catch(e) {}
    dbClient.from('perfil')
      .update({ perfil_presupuesto: 'personalizado' })
      .eq('usuario_id', window.currentUserId)
  }
  actualizarAnalisis()  // full re-render: input no longer focused
}

const _MESES_SEG = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function _iconMovSeg(esFijo, cat) {
  const partes = (cat || '').trim().split(' ')
  return partes[0] && /\p{Emoji}/u.test(partes[0]) ? partes[0] : (esFijo ? '📌' : '💸')
}

function _diaMesSeg(fecha) {
  if (!fecha) return ''
  const [, m, d] = fecha.split('-')
  return `${parseInt(d)} ${_MESES_SEG[parseInt(m) - 1]}`
}

let movsRealMes = {}
let _segMovs = []
let segCardAbiertoIdx = null
let _scDetalleOpenCat = null

function renderMovsSeg(cat) {
  const movs = movsRealMes[cat] || []
  if (movs.length === 0) return '<div class="cat-movs-empty">Sin transacciones este mes</div>'
  return movs.map(m => {
    const idx = _segMovs.length
    _segMovs.push(m)
    const esFijo = m.tipo === 'fijo'
    const icono = _iconMovSeg(esFijo, m.categoria)
    const nombre = (m.label || m.categoria || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    const fecha = _diaMesSeg(m.fecha)
    const monto = fmt(m.monto)
    return `
      <div class="cat-mov-item">
        <div class="cm-icon">${icono}</div>
        <div class="cm-info">
          <div class="cm-nombre">${nombre}</div>
          <div class="cm-fecha">${fecha}</div>
        </div>
        <div class="cm-monto">${monto}</div>
        <div class="cm-edit" onclick="abrirEdicionGastoSeg(${idx})">✏️</div>
      </div>`
  }).join('')
}

function _buildDetalleHtml(cat, estimado, real) {
  const overBudget = real > estimado
  const pct = estimado > 0 ? Math.min(100, (real / estimado) * 100) : (real > 0 ? 100 : 0)
  const barColor = overBudget ? '#ef4444' : '#10b981'
  const gastadoColor = overBudget ? '#ef4444' : '#10b981'
  const movs = (movsRealMes[cat] || []).slice().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
  const movsHtml = movs.length === 0
    ? '<div class="sc-det-empty">Sin movimientos este mes</div>'
    : movs.map(m => {
        const nombre = (m.label || cat).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        return `<div class="sc-det-mov"><div class="sc-det-mov-info"><span class="sc-det-mov-name">${nombre}</span><span class="sc-det-mov-date">${_diaMesSeg(m.fecha)}</span></div><span class="sc-det-mov-amount">${fmt(m.monto)}</span></div>`
      }).join('')
  return `<div class="sc-det-inner"><div class="sc-det-summary"><div class="sc-det-col"><div class="sc-det-lbl">Gastado</div><div class="sc-det-amt" style="color:${gastadoColor}">${fmt(real)}</div></div><div class="sc-det-col" style="text-align:right"><div class="sc-det-lbl">Meta</div><div class="sc-det-amt" style="color:#f1f5f9">${fmt(estimado)}</div></div></div><div class="sc-det-bar-wrap"><div class="sc-det-bar"><div class="sc-det-bar-fill" style="width:${pct.toFixed(1)}%;background:${barColor}"></div></div><div class="sc-det-bar-nums"><span style="color:${gastadoColor}">${fmt(real)}</span><span style="color:#94a3b8">${fmt(estimado)}</span></div></div><div class="sc-det-movs">${movsHtml}</div></div>`
}

function scToggleDetalle(cat, estimado, real) {
  const safeId = cat.replace(/[^a-zA-Z0-9]/g, '_')
  const panelEl = document.getElementById('sc-det-panel-' + safeId)
  const chevEl  = document.getElementById('sc-det-chev-' + safeId)
  if (!panelEl) return
  const isOpen = panelEl.dataset.open === '1'
  if (isOpen) {
    panelEl.style.maxHeight = '0'
    panelEl.dataset.open = '0'
    if (chevEl) chevEl.style.transform = 'rotate(0deg)'
    _scDetalleOpenCat = null
  } else {
    if (!panelEl.innerHTML.trim()) panelEl.innerHTML = _buildDetalleHtml(cat, estimado, real)
    panelEl.style.maxHeight = '600px'
    panelEl.dataset.open = '1'
    if (chevEl) chevEl.style.transform = 'rotate(180deg)'
    _scDetalleOpenCat = cat
  }
}

function toggleCardMovsSeg(idx, event) {
  if (event) {
    if (event.target.closest('.sc-toggle')) return
  }
  const wrap = document.getElementById('sc-movs-' + idx)
  if (!wrap) return
  const yaAbierto = wrap.classList.contains('sc-abierto')
  if (segCardAbiertoIdx !== null && segCardAbiertoIdx !== idx) {
    const prev = document.getElementById('sc-movs-' + segCardAbiertoIdx)
    if (prev) prev.classList.remove('sc-abierto')
  }
  if (yaAbierto) {
    wrap.classList.remove('sc-abierto')
    segCardAbiertoIdx = null
  } else {
    wrap.classList.add('sc-abierto')
    segCardAbiertoIdx = idx
  }
}

let _editandoSegItem = null

function abrirEdicionGastoSeg(idx) {
  const m = _segMovs[idx]
  if (!m) return
  _editandoSegItem = m
  const esFijo = m.tipo === 'fijo'
  document.getElementById('seg-edit-title').textContent = esFijo ? 'Editar gasto fijo' : 'Editar gasto'
  document.getElementById('seg-fld-descripcion').style.display = esFijo ? 'none' : ''
  document.getElementById('seg-fld-nombre').style.display = esFijo ? '' : 'none'
  document.getElementById('seg-fld-fecha').style.display = esFijo ? 'none' : ''
  if (esFijo) {
    document.getElementById('seg-nombre').value = m.label || ''
  } else {
    document.getElementById('seg-descripcion').value = m.label || ''
    const dpBtn = document.querySelector('[data-dp-for="seg-fecha"]')
    const dpTxt = dpBtn?.querySelector('.dp-txt')
    document.getElementById('seg-fecha').value = m.fecha || ''
    if (dpTxt) { dpTxt.textContent = m.fecha || ''; dpTxt.dataset.empty = m.fecha ? 'false' : 'true' }
  }
  document.getElementById('seg-monto').value = m.monto || ''
  document.getElementById('modal-editar-gasto-seg').classList.add('visible')
}

function cerrarEdicionGastoSeg() {
  document.getElementById('modal-editar-gasto-seg').classList.remove('visible')
  _editandoSegItem = null
}

async function guardarEdicionGastoSeg() {
  if (!_editandoSegItem) return
  const m = _editandoSegItem
  const monto = parseFloat(document.getElementById('seg-monto').value)
  if (isNaN(monto) || monto <= 0) { toast('Monto inválido', 'err'); return }
  if (m.tipo === 'fijo') {
    const nombre = document.getElementById('seg-nombre').value.trim()
    const { error } = await dbClient.from('gastos_fijos').update({ nombre, monto }).eq('id', m.id)
    if (error) { toast('Error al guardar', 'err'); return }
  } else {
    const descripcion = document.getElementById('seg-descripcion').value.trim()
    const fecha = document.getElementById('seg-fecha').value
    const { error } = await dbClient.from('gastos').update({ descripcion, monto, fecha }).eq('id', m.id)
    if (error) { toast('Error al guardar', 'err'); return }
  }
  cerrarEdicionGastoSeg()
  toast('Guardado')
  cargarGastosRealMes()
}

let gastosRealMes = {}

async function cargarGastosRealMes() {
  if (!window.currentUserId) {
    await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve() }
      }, 50)
      setTimeout(() => { clearInterval(iv); resolve() }, 5000)
    })
  }
  if (!window.currentUserId) return
  const uid = window.currentUserId
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const inicioMes = `${mesActual}-01`

  const [{ data: gastosData, error: errG }, { data: fijosData, error: errF }] = await Promise.all([
    dbClient.from('gastos').select('id, fecha, monto, categoria, descripcion').eq('usuario_id', uid).gte('fecha', inicioMes),
    dbClient.from('gastos_fijos').select('id, categoria, monto, nombre, fecha_inicio, fecha_fin, dia_del_mes').eq('usuario_id', uid)
  ])

  if (errG || errF) return
  gastosRealMes = {}
  movsRealMes = {}
  ;(gastosData || []).forEach(g => {
    const cat = g.categoria || 'Otros'
    gastosRealMes[cat] = (gastosRealMes[cat] || 0) + parseFloat(g.monto || 0)
    if (!movsRealMes[cat]) movsRealMes[cat] = []
    movsRealMes[cat].push({ id: g.id, tipo: 'gasto', label: g.descripcion || cat, fecha: g.fecha, monto: parseFloat(g.monto || 0), categoria: cat })
  })
  ;(fijosData || []).forEach(f => {
    const desde = f.fecha_inicio ? f.fecha_inicio.substring(0, 7) : null
    if (!desde) return
    const hasta = f.fecha_fin ? f.fecha_fin.substring(0, 7) : mesActual
    if (mesActual < desde || mesActual > hasta) return
    const cat = f.categoria || 'Otros'
    gastosRealMes[cat] = (gastosRealMes[cat] || 0) + parseFloat(f.monto || 0)
    const [kAnio, kMes] = mesActual.split('-').map(Number)
    const ultimoDia = new Date(kAnio, kMes, 0).getDate()
    const dia = Math.min(f.dia_del_mes || 1, ultimoDia)
    const fechaFijo = `${mesActual}-${String(dia).padStart(2, '0')}`
    if (!movsRealMes[cat]) movsRealMes[cat] = []
    movsRealMes[cat].push({ id: f.id, tipo: 'fijo', label: f.nombre || cat, fecha: fechaFijo, monto: parseFloat(f.monto || 0), categoria: cat })
  })
  renderTablaComparativa()
}

let seguimientoActivos = {}

async function cargarSeguimientoActivos() {
  if (!window.currentUserId) return
  const { data } = await dbClient.from('user_preferences')
    .select('seguimiento_activos').eq('user_id', window.currentUserId).maybeSingle()
  if (data?.seguimiento_activos) seguimientoActivos = data.seguimiento_activos
  renderTablaComparativa()
}

function irACategoriaPlanificador(key) {
  irPaso(2)
  const detalle = document.getElementById('detalle-gastos')
  if (detalle && detalle.style.display !== 'block') toggleBloque('gastos')
  setTimeout(() => {
    let el
    if (key.startsWith('__grupo_')) {
      const gid = key.replace('__grupo_', '')
      el = document.querySelector('.var-group[data-grupo-id="' + gid + '"]')
    } else {
      el = [...document.querySelectorAll('.var-row')].find(r => r._planCat === key)
    }
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('sc-highlight-plan')
    setTimeout(() => el.classList.remove('sc-highlight-plan'), 1500)
  }, 320)
}

function toggleSeguimiento(cat) {
  seguimientoActivos[cat] = seguimientoActivos[cat] === false ? true : false
  if (window.currentUserId) {
    dbClient.from('user_preferences').upsert(
      { user_id: window.currentUserId, seguimiento_activos: seguimientoActivos, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ).then(() => {})
  }
  renderTablaComparativa()
}

function renderTablaComparativa() {
  const cont = document.getElementById('tabla-comp-body')
  if (!cont) return
  const inputs = [...document.querySelectorAll('.variable-input')]
  if (inputs.length === 0) {
    cont.innerHTML = '<div class="tabla-comp-empty">Sin categorías variables</div>'
    return
  }

  const hoy    = new Date()
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)
  const dHoy   = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  const dFin   = new Date(finMes.getFullYear(), finMes.getMonth(), finMes.getDate())
  const diasQuedan = Math.round((dFin - dHoy) / 86400000) + 1

  _segMovs = []
  let scIdx = 0

  // Categories that belong to a group → rendered as a combined group card
  const enGruposSeg = new Set(_planGrupos.flatMap(g => g.categorias))

  const tarjetas = inputs.map(inp => {
    const cat      = inp.closest('.var-row')?._planCat || inp.dataset.cat
    if (!cat) return null
    if (enGruposSeg.has(cat)) return null   // shown via group card below
    const estimado = parseFloat(inp.value) || 0
    const real     = gastosRealMes[cat] || 0
    const esVacio  = estimado === 0 && real === 0
    const activo   = esVacio ? false : (seguimientoActivos[cat] !== false)
    const partes   = cat.trim().split(' ')
    const emoji    = partes[0]
    const nombre   = partes.slice(1).join(' ') || cat
    const catEsc   = cat.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

    const diff   = real - estimado
    const esFijo = !!categoriaFijos[cat]
    return { activo, esVacio, diff, estimado, real, label: `${emoji} ${nombre}`, esFijo, cat, catEsc }
  })

  // Group cards — combined real spending vs group budget
  const tarjetasGrupos = _planGrupos.flatMap(grupo => {
    const catsValidas = grupo.categorias.filter(c => Object.prototype.hasOwnProperty.call(gastosOriginal, c))
    if (catsValidas.length === 0) return []

    let estimado = 0
    catsValidas.forEach(cat => {
      const row = [...document.querySelectorAll('.var-row')].find(r => r._planCat === cat)
      const inp = row?.querySelector('.variable-input')
      if (inp) estimado += parseFloat(inp.value) || 0
    })

    const real      = catsValidas.reduce((s, cat) => s + (gastosRealMes[cat] || 0), 0)
    const grupoKey  = '__grupo_' + grupo.id
    const esVacio   = estimado === 0 && real === 0
    const activo    = esVacio ? false : (seguimientoActivos[grupoKey] !== false)
    const grupoKeyEsc = grupoKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

    const diff = real - estimado
    return [{ activo, esVacio, diff, estimado, real, label: `${grupo.emoji} ${grupo.nombre}`, esFijo: false, cat: null, catEsc: null }]
  })

  const tarjetasValidas = [...tarjetas, ...tarjetasGrupos].filter(Boolean)
  tarjetasValidas.sort((a, b) => {
    if (a.esVacio !== b.esVacio) return a.esVacio ? 1 : -1
    if (a.activo !== b.activo) return a.activo ? -1 : 1
    return b.diff - a.diff
  })

  const activasTodas   = tarjetasValidas.filter(t => t.activo && !t.esVacio)
  _redistribTodas = activasTodas
  const activas        = activasTodas.filter(t => !t.esFijo)
  const totalEstimado  = activasTodas.reduce((s, t) => s + t.estimado, 0)
  const totalGastado   = activasTodas.reduce((s, t) => s + t.real, 0)
  const teQuedan       = totalEstimado - totalGastado
  const verdes         = activas.filter(t => t.diff < 0)
  const rojas          = activas.filter(t => t.diff > 0)

  const quedanClass = teQuedan < 0 ? ' sc-resumen-over' : ''
  const quedanTxt   = teQuedan >= 0
    ? `Te quedan ${fmt(teQuedan)} para ${diasQuedan} día${diasQuedan === 1 ? '' : 's'} · ${fmt(teQuedan / diasQuedan, 0)} al día`
    : `Te has pasado ${fmt(Math.abs(teQuedan))} del total estimado`

  const pasadas = activasTodas.filter(t => !t.esFijo && t.diff > 0)
  const margen  = activasTodas.filter(t => !t.esFijo && t.diff <= 0)
  const ocultas = activasTodas.filter(t => t.esFijo)

  const _filaLista = t => {
    const pinClass = t.esFijo ? 'sc-lista-pin sc-pin-on' : 'sc-lista-pin'
    const pin = t.catEsc ? `<span class="${pinClass}" onclick="event.stopPropagation();toggleEsFijo('${t.catEsc}')">📌</span>` : ''
    const idx = _redistribTodas.indexOf(t)

    if (!t.catEsc) {
      // Group rows — no chev, no pin, no expandable detail
      const labelHtml = `<span class="sc-lista-label">${t.label}</span>`
      if (t.diff > 0) return `<div class="sc-lista-row">${labelHtml}<div class="sc-lista-row-right"><span class="sc-lista-pill sc-lista-pill-over">${fmt(Math.abs(t.diff))} pasado</span><button class="sc-lista-repartir" onclick="abrirRedistrib(${idx})">↻ Repartir</button></div></div>`
      return `<div class="sc-lista-row">${labelHtml}<span class="sc-lista-pill sc-lista-pill-free">${fmt(Math.abs(t.diff))} libre</span></div>`
    }

    const safeId = t.cat.replace(/[^a-zA-Z0-9]/g, '_')
    const isOpen = t.cat === _scDetalleOpenCat
    const chevRot = isOpen ? 'rotate(180deg)' : 'rotate(0deg)'
    const panelContent = isOpen ? _buildDetalleHtml(t.cat, t.estimado, t.real) : ''
    const panelMaxH = isOpen ? '600px' : '0'
    const chev = `<span class="sc-det-chev" id="sc-det-chev-${safeId}" style="transform:${chevRot}">▾</span>`

    // Chevron goes right after the name (left side); pin goes far right
    const labelHtml = `<span class="sc-lista-label">${t.label}${chev}</span>`
    const pctFila = t.estimado > 0 ? t.real / t.estimado : (t.real > 0 ? 1.01 : 0)
    const barra = t.esFijo ? '' : `<div class="sc-fila-barra${t.diff > 0 ? ' over' : pctFila > 0.85 ? ' cerca' : ''}"><i style="--w:${Math.min(1, pctFila).toFixed(3)}"></i></div>
      <div class="sc-fila-nums num">${fmt(t.real, 0)} de ${fmt(t.estimado, 0)}</div>`

    let rightHtml
    if (t.esFijo) {
      rightHtml = `<div class="sc-lista-row-right">${pin}</div>`
    } else if (t.diff > 0) {
      rightHtml = `<div class="sc-lista-row-right"><span class="sc-lista-pill sc-lista-pill-over">${fmt(Math.abs(t.diff))} pasado</span>${pin}</div>`
    } else {
      rightHtml = `<div class="sc-lista-row-right"><span class="sc-lista-pill sc-lista-pill-free">${fmt(Math.abs(t.diff))} libre</span>${pin}</div>`
    }

    const cubrir = !t.esFijo && t.diff > 0 ? `<div class="sc-cubrir"><button type="button" class="sc-cubrir-btn" onclick="cubrirExceso([${idx}])">Cubrir con lo que sobra</button><button type="button" class="sc-elegir-btn" onclick="abrirRedistrib(${idx})">Elegir yo</button></div>` : ''
    return `<div class="sc-lista-row-wrap${t.diff > 0 && !t.esFijo ? ' sc-pasada' : ''}"><div class="sc-lista-row sc-lista-row-clickable" onclick="scToggleDetalle('${t.catEsc}',${t.estimado},${t.real})">${labelHtml}${rightHtml}</div>${barra}${cubrir}<div class="sc-det-panel" id="sc-det-panel-${safeId}" style="max-height:${panelMaxH}" data-open="${isOpen?'1':'0'}">${panelContent}</div></div>`
  }

  const gruposHtml = []
  const exceso = pasadas.reduce((s, t) => s + t.diff, 0), libre = margen.reduce((s, t) => s - t.diff, 0)
  if (pasadas.length > 1) gruposHtml.push(`<div class="sc-aviso-pasadas"><div><b>${pasadas.length} categorías se han pasado</b><span class="num">${fmt(exceso)} de más · tienes ${fmt(libre)} libres en otras</span></div>
    <button type="button" class="sc-cubrir-btn" onclick="cubrirExceso([${pasadas.map(t => _redistribTodas.indexOf(t)).join(',')}])">Cubrir todo</button></div>`)
  if (pasadas.length > 0) gruposHtml.push(`<div class="sc-lista-grupo"><div class="sc-lista-grupo-title">⚠️ Pasadas</div>${pasadas.map(_filaLista).join('')}</div>`)
  if (margen.length > 0) {
    if (gruposHtml.length) gruposHtml.push('<div class="sc-lista-sep"></div>')
    gruposHtml.push(`<div class="sc-lista-grupo"><div class="sc-lista-grupo-title">✅ Con margen</div>${margen.map(_filaLista).join('')}</div>`)
  }
  if (ocultas.length > 0) {
    if (gruposHtml.length) gruposHtml.push('<div class="sc-lista-sep"></div>')
    const maxH = _listaOcultoOpen ? '2000px' : '0'
    const chevRot = _listaOcultoOpen ? 'rotate(180deg)' : ''
    gruposHtml.push(`
      <div>
        <div class="sc-lista-oculto-toggle" onclick="toggleListaOculto()">
          <span class="sc-lista-oculto-label">📌 Fijos</span>
          <span class="sc-lista-oculto-chev" id="sc-lista-oculto-chev" style="transform:${chevRot}">▾</span>
        </div>
        <div class="sc-lista-oculto-body" id="sc-lista-oculto-body" style="max-height:${maxH}">
          <div class="sc-lista-grupo" style="padding-top:0">${ocultas.map(_filaLista).join('')}</div>
        </div>
      </div>`)
  }

  // Lo que queda del mes, en grande: cuánto, para cuántos días y cuánto al día
  const pctMes = totalEstimado > 0 ? Math.min(100, totalGastado / totalEstimado * 100) : 0
  const hero = teQuedan >= 0
    ? `<span class="v-lbl">Te quedan este mes</span><b class="v-cifra num">${fmt(teQuedan, 0)}</b>
       <p>Para ${diasQuedan} día${diasQuedan === 1 ? '' : 's'} · <b class="num">${fmt(teQuedan / diasQuedan, 0)} al día</b></p>`
    : `<span class="v-lbl">Este mes</span><b class="v-cifra num">−${fmt(Math.abs(teQuedan), 0)}</b>
       <p>Te has pasado ${fmt(Math.abs(teQuedan))} del total estimado. Reparte el exceso entre las categorías con margen.</p>`
  cont.innerHTML = `
    <div class="veredicto seg-hero ${teQuedan >= 0 ? 'pos' : 'neg'}">${hero}
      <div class="seg-hero-barra" role="img" aria-label="${Math.round(pctMes)} % del plan gastado"><i style="--w:${(pctMes / 100).toFixed(3)}"></i></div>
      <span class="seg-hero-pie num">${fmt(totalGastado, 0)} gastado de ${fmt(totalEstimado, 0)} del plan</span>
    </div>
    <div class="sc-lista-card">
      ${gruposHtml.join('')}
    </div>
  `
}

// ═════════════ Recorrido guiado en 4 pasos ═════════════
let ahorroRealMedio = null   // ahorro real medio de los últimos meses cerrados
let mesesBase = []           // meses usados para las medias
let metaProgreso = null      // { actual, objetivo, fechaLimite } de la meta principal
let calcMeta = null          // cálculo del modal de crear meta
let _pasoElegido = false

function irPaso(n) {
  document.querySelectorAll('.paso').forEach(p => { p.hidden = p.id !== 'paso-' + n })
  document.querySelectorAll('.paso-tab').forEach(t => {
    const act = +t.dataset.paso === n
    t.classList.toggle('activo', act)
    t.setAttribute('aria-selected', String(act))
  })
  try { localStorage.setItem('mf-metas-paso', n) } catch (e) {}
  _pasoElegido = true
  const nav = document.querySelector('.pasos')
  if (nav && nav.getBoundingClientRect().top < 0) window.scrollTo({ top: window.scrollY + nav.getBoundingClientRect().top - 8, behavior: 'smooth' })
}
// Primera vez: paso 1. Después: el último paso visitado o, con meta, el seguimiento.
function elegirPasoInicial(hayMeta) {
  if (_pasoElegido) return
  let guardado = null
  try { guardado = parseInt(localStorage.getItem('mf-metas-paso')) } catch (e) {}
  irPaso(guardado >= 1 && guardado <= 4 ? guardado : hayMeta ? 4 : 1)
}

const nombreCat = c => (c || '').trim().replace(/^[^\p{L}\p{N}]+/u, '').trim()
const emojiCat = c => { const t = (c || '').trim(); const f = [...t][0]; return f && f.codePointAt(0) > 127 ? t.slice(0, t.length - nombreCat(t).length).trim() : '📦' }

// Paso 1: lo que entra y lo que de verdad se gasta de media
function renderPaso1() {
  const cont = document.getElementById('real-lista')
  if (!cont) return
  const cats = Object.entries(gastosOriginal).sort((a, b) => b[1] - a[1])
  const total = cats.reduce((t, [, v]) => t + Math.round(v), 0)  // mismo redondeo que el plan del paso 2
  const ing = totalIngresos()
  document.getElementById('real-sub').textContent = mesesBase.length ? `media de ${mesesBase.slice().reverse().join(', ')}` : ''
  cont.innerHTML = cats.length ? '' : '<p class="real-vacio">Aún no hay meses cerrados con gastos. Cuando termine tu primer mes verás aquí tu media real.</p>'
  cats.forEach(([c, v]) => {
    const fila = document.createElement('div')
    fila.className = 'real-fila'
    const nec = (categoriaTipos[c] ?? 'opcional') === 'necesario'
    fila.innerHTML = `<span class="real-ico" aria-hidden="true"></span><span class="real-nom"></span>${nec ? '<span class="etq-nec">Necesario</span>' : ''}<b class="num"></b>`
    fila.querySelector('.real-ico').textContent = emojiCat(c)
    fila.querySelector('.real-nom').textContent = nombreCat(c)
    fila.querySelector('b').textContent = fmt(Math.round(v))
    cont.appendChild(fila)
  })
  document.getElementById('real-total').textContent = fmt(Math.round(total))
  // Cada categoría con su barra: qué parte del total se lleva
  const mayor = cats.length ? cats[0][1] : 1
  cont.querySelectorAll('.real-fila').forEach((f, k) => {
    const b = document.createElement('i'); b.className = 'real-barra'; b.style.setProperty('--w', (cats[k][1] / mayor).toFixed(3)); f.appendChild(b)
  })
  const ver = document.getElementById('real-veredicto')
  if (!ing || !cats.length) { ver.innerHTML = ''; return }
  const saldo = Math.round(ing - total)
  const tope = Math.max(ing, total)
  ver.className = 'veredicto ' + (saldo < 0 ? 'neg' : 'pos')
  ver.innerHTML = `<span class="v-lbl">Con tus gastos de hoy</span>
    <b class="v-cifra num"><span data-cuenta="${saldo}">${(saldo > 0 ? '+' : '') + fmt(saldo)}</span> <small>al mes</small></b>
    <div class="v-balanza">
      <div class="v-fila"><span>Entra</span><i class="v-entra" style="--w:${(ing / tope).toFixed(3)}"></i><b class="num">${fmt(Math.round(ing))}</b></div>
      <div class="v-fila"><span>Sale</span><i class="v-sale" style="--w:${(total / tope).toFixed(3)}"></i><b class="num">${fmt(Math.round(total))}</b></div>
    </div>
    <p>${saldo < 0
      ? 'Gastas más de lo que entra. No pasa nada: en el siguiente paso vemos cómo darle la vuelta.'
      : `Te sobra dinero cada mes (${Math.round(saldo / ing * 100)} % de lo que entra). Vamos a convertirlo en un plan de ahorro.`}</p>`
  contar(ver.querySelector('[data-cuenta]'))
}

// La cifra grande sube desde 0 la primera vez que se ve; después cambia sin animación
let _contado = false
function contar(el) {
  if (!el || _contado || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  _contado = true
  const fin = +el.dataset.cuenta, t0 = performance.now()
  const paso = t => {
    const k = Math.min(1, (t - t0) / 900), v = Math.round(fin * (1 - Math.pow(1 - k, 3)))
    if (el.isConnected) el.textContent = (v > 0 ? '+' : '') + fmt(v)
    if (k < 1) requestAnimationFrame(paso)
  }
  requestAnimationFrame(paso)
}

// Lo que casi nadie puede recortar: la propuesta no lo toca (salvo que el usuario lo marque como opcional)
const CASI_NECESARIO = /alquiler|hipoteca|cr[eé]dito|pr[eé]stamo|luz|agua|\bgas\b|internet|seguro|supermercado|salud|farmacia|colegio|guarder/i
const esRecortable = cat => categoriaTipos[cat] === 'opcional' || (!categoriaTipos[cat] && !CASI_NECESARIO.test(cat))

// Paso 2: la app propone dónde recortar para llegar al objetivo, sin bajar nada de la mitad de su media
let _antesPropuesta = null
function renderPropuesta() {
  const el = document.getElementById('propuesta')
  if (!el) return
  const ing = totalIngresos()
  if (!ing) { el.innerHTML = ''; return }
  const objetivo = Math.round(100 - metaAhorro)
  const falta = totalGastos() - ing * objetivo / 100
  if (_antesPropuesta) {
    el.className = 'propuesta hecha'
    el.innerHTML = `<b>Propuesta aplicada</b><p>Revisa cada categoría abajo: si algo no lo vas a cumplir, súbelo.</p><button type="button" class="prop-btn sec" onclick="deshacerPropuesta()">Deshacer</button>`
    return
  }
  if (falta <= 0.5) {
    el.className = 'propuesta ok'
    el.innerHTML = `<b>Tu plan cumple el objetivo 🎉</b><p>Ahorras ${fmt(Math.round(ing - totalGastos()))} al mes. Si quieres, ajusta las categorías a tu gusto.</p>`
    return
  }
  const filas = [...document.querySelectorAll('#gastos-lista-plan .var-row')].filter(r => r._planCat && esRecortable(r._planCat) && !categoriaFijos[r._planCat])
    .map(r => {
      const inp = r.querySelector('.variable-input'), v = parseFloat(inp.value) || 0, media = gastosOriginal[r._planCat] || v
      return { cat: r._planCat, inp, v, hueco: Math.max(0, v - Math.round(media * 0.5)) }
    }).filter(x => x.hueco >= 5)
  const hueco = filas.reduce((t, x) => t + x.hueco, 0)
  if (!filas.length) { el.className = 'propuesta'; el.innerHTML = `<b>Nada que recortar a la vista</b><p>Todo está marcado como necesario. Si algo es opcional (salidas, compras…), quita «Necesario» en esa categoría.</p>`; return }
  const parte = Math.min(1, falta / hueco)
  const cambios = filas.map(x => ({ ...x, nuevo: Math.max(0, Math.round((x.v - x.hueco * parte) / 5) * 5) })).filter(x => x.nuevo < x.v).sort((a, b) => (b.v - b.nuevo) - (a.v - a.nuevo))
  const ahorro = cambios.reduce((t, x) => t + x.v - x.nuevo, 0)
  el.className = 'propuesta'
  el.innerHTML = `<span class="prop-eyebrow">La app te propone</span>
    <b>Recorta ${fmt(Math.round(ahorro))} en lo que no es imprescindible</b>
    <ul>${cambios.slice(0, 6).map(x => `<li><span>${MF.esc(emojiCat(x.cat))} ${MF.esc(nombreCat(x.cat))}</span><s class="num">${fmt(Math.round(x.v))}</s><span aria-hidden="true">→</span><b class="num">${fmt(x.nuevo)}</b></li>`).join('')}</ul>
    ${parte < 1 ? `<p class="prop-aviso">Ni bajando estas categorías a la mitad de su media llegas al ${objetivo} %. Prueba un ritmo más suave o revisa lo que marcaste como necesario.</p>` : `<p>No bajamos nada de la mitad de tu media real: es un plan que puedes cumplir.</p>`}
    <button type="button" class="prop-btn" onclick="aplicarPropuesta()">Aplicar propuesta</button>`
  el._cambios = cambios
}
function aplicarPropuesta() {
  const el = document.getElementById('propuesta'), cambios = el._cambios || []
  _antesPropuesta = cambios.map(x => [x.inp, x.inp.value])
  cambios.forEach(x => { x.inp.value = x.nuevo })
  guardarGastosLocal(); actualizarPlanificador()
}
function deshacerPropuesta() {
  ;(_antesPropuesta || []).forEach(([inp, v]) => { inp.value = v })
  _antesPropuesta = null
  guardarGastosLocal(); actualizarPlanificador()
}

// Paso 2: medidor en vivo y tarjetas de tipo de ahorro
function renderPlanExtras() {
  const med = document.getElementById('medidor'), tipos = document.getElementById('tipos-ahorro')
  if (!med || !tipos) return
  const ing = totalIngresos()
  if (!ing) { med.innerHTML = '<p class="med-vacio">Indica tus ingresos en el paso 1 para hacer el plan.</p>'; tipos.innerHTML = ''; return }
  const gastos = totalGastos()
  const pG = gastos / ing * 100
  const objetivo = Math.round(100 - metaAhorro)
  const ahorroPlan = ing - gastos
  const sobra = gastos - ing * objetivo / 100
  const tope = Math.max(110, pG + 5)
  const ok = pG <= objetivo + 0.5
  med.className = 'medidor ' + (ok ? 'ok' : pG > 100 ? 'mal' : 'cerca')
  med.innerHTML = `
    <div class="med-top"><span>Gastos</span><b class="num">${Math.round(pG)} %</b><span class="med-obj">objetivo ${objetivo} %</span></div>
    <div class="med-barra"><i style="width:${Math.min(100, pG / tope * 100)}%"></i><em style="left:${objetivo / tope * 100}%"></em><em class="cien" style="left:${100 / tope * 100}%"></em></div>
    <p class="med-msg">${ok
      ? `Cumples tu plan: ahorras <b>${fmt(Math.round(ahorroPlan))} al mes</b>.`
      : pG > 100
        ? `Gastas ${fmt(Math.round(-ahorroPlan))} más de lo que entra. Recorta <b>${fmt(Math.ceil(sobra))}</b> para llegar a tu objetivo.`
        : `Te faltan <b>${fmt(Math.ceil(sobra))}</b> de recortes para llegar al ${objetivo} %.`}</p>`
  const T = [['basico', 'Básico', 'Para empezar'], ['equilibrado', 'Equilibrado', 'Disfrutar y avanzar'], ['ahorrador', 'Ahorrador', 'Ahorro a fondo']]
  tipos.innerHTML = T.map(([k, nom, lema]) => {
    const p = PERFILES_AHORRO[k]
    return `<button type="button" role="radio" aria-checked="${perfilAhorro === k}" class="tipo${perfilAhorro === k ? ' activo' : ''}" onclick="seleccionarPerfil('${k}')">
      <span class="tipo-nom">${nom}</span><span class="tipo-pct num">${p.ahorro} %</span><span class="tipo-eur num">${fmt(Math.round(ing * p.ahorro / 100))}/mes</span><span class="tipo-lema">${lema}</span></button>`
  }).join('') + `<button type="button" role="radio" aria-checked="${perfilAhorro === 'personalizado'}" class="tipo${perfilAhorro === 'personalizado' ? ' activo' : ''}" onclick="elegirPersonalizado()">
      <span class="tipo-nom">A tu medida</span><span class="tipo-pct num">${Math.round(metaAhorro)} %</span><span class="tipo-eur num">${fmt(Math.round(ing * metaAhorro / 100))}/mes</span><span class="tipo-lema">Tú decides</span></button>`
}
function elegirPersonalizado() {
  seleccionarPerfil('personalizado')
  setTimeout(() => { const i = document.querySelector('.asi-meta-inp'); if (i) { i.focus(); i.select() } }, 50)
}

// Sinceridad: aviso amable si una categoría baja a menos de la mitad de su media real
function avisosSinceridad() {
  document.querySelectorAll('#gastos-lista-plan .var-row').forEach(row => {
    const cat = row._planCat, inp = row.querySelector('.variable-input')
    if (!cat || !inp) return
    const media = gastosOriginal[cat] || 0, val = parseFloat(inp.value) || 0
    let av = row.querySelector('.aviso-sincero')
    const mostrar = media >= 20 && val < media * 0.5
    if (!mostrar) { if (av) av.remove(); return }
    if (!av) { av = document.createElement('div'); av.className = 'aviso-sincero'; row.appendChild(av) }
    av.textContent = val === 0
      ? `Tu media real es ${fmt(Math.round(media))}. ¿Seguro que este mes no gastarás nada aquí?`
      : `Tu media real es ${fmt(Math.round(media))}. Bajarlo a ${fmt(Math.round(val))} es mucho: hazlo solo si de verdad puedes.`
  })
}

// Paso 3: ¿es realista la meta? Compara lo que exige con lo que deja el plan y con lo que ahorras de verdad
function nivelRealismo(necesario, planAhorro, real) {
  if (necesario <= 0) return 'cumplida'
  const plan = planAhorro + 1  // un euro de margen por los redondeos
  if (necesario <= plan && (real === null || necesario <= Math.max(0, real) * 1.15)) return 'realista'
  if (necesario <= plan) return 'ambiciosa'
  return 'dificil'
}
function renderRealismo() {
  const el = document.getElementById('meta-realismo'), seg = document.getElementById('seg-meta')
  if (!el || !metaFondoData || !metaProgreso) return
  const { actual, objetivo, fechaLimite } = metaProgreso
  const faltan = Math.max(0, objetivo - actual)
  const meses = mesesRestantes(fechaLimite) || 1
  const necesario = faltan / meses
  const planAhorro = totalIngresos() - totalGastos()
  const nivel = nivelRealismo(necesario, planAhorro, ahorroRealMedio)
  const alcanzable = actual + Math.max(0, planAhorro) * meses
  const txt = {
    cumplida: ['Meta cumplida', '¡Lo lograste! Puedes subir la meta o ponerte una nueva.'],
    realista: ['Realista', `Necesitas ${fmt(Math.ceil(necesario))}/mes. Tu plan deja ${fmt(Math.round(planAhorro))}${ahorroRealMedio !== null ? ` y de media ahorras ${fmt(Math.round(ahorroRealMedio))}` : ''}. Vas bien.`],
    ambiciosa: ['Ambiciosa', `Tu plan lo permite (${fmt(Math.round(planAhorro))}/mes), pero de media has ahorrado ${fmt(Math.round(ahorroRealMedio || 0))}. Si cumples el plan cada mes, llegas.`],
    dificil: ['Difícil de cumplir', planAhorro <= 0
      ? `Necesitas ${fmt(Math.ceil(necesario))}/mes, pero tu plan todavía no deja ahorro. Vuelve a Tu plan y ajusta tus gastos antes de fijar la meta.`
      : `Necesitas ${fmt(Math.ceil(necesario))}/mes y tu plan deja ${fmt(Math.round(planAhorro))}. Para no frustrarte, ajusta la meta a unos ${fmt(Math.round(alcanzable / 10) * 10)} o dale más tiempo.`],
  }[nivel]
  renderPlanVs()
  el.hidden = false
  el.className = 'realismo ' + nivel
  const ajuste = nivel === 'dificil' && planAhorro > 0 ? Math.floor(alcanzable / 10) * 10 : 0
  el.innerHTML = `<span class="r-sem" aria-hidden="true"><i></i><i></i><i></i></span><div><b>${txt[0]}</b><p>${txt[1]}</p>${ajuste > actual
    ? `<button type="button" class="r-ajustar" onclick="ajustarMetaAlcanzable(${ajuste})">Dejarla en ${fmt(ajuste)}, que sí llego</button>` : ''}</div>`
  const pct = objetivo > 0 ? Math.min(100, actual / objetivo * 100) : 0
  seg.innerHTML = `<button type="button" class="seg-meta ${nivel}" onclick="irPaso(3)">
    <span class="sm-top"><span class="sm-nom"></span><b class="num">${Math.round(pct)} %</b></span>
    <span class="sm-barra"><i style="width:${pct}%"></i></span>
    <span class="sm-sub">Llevas ${fmt(Math.round(actual))} de ${fmt(Math.round(objetivo))} · ${txt[0].toLowerCase()}${faltan > 0 ? ` · ${fmt(Math.ceil(necesario))}/mes` : ''}</span></button>`
  seg.querySelector('.sm-nom').textContent = `${metaFondoData.icono || '🎯'} ${metaFondoData.nombre}`
}
async function ajustarMetaAlcanzable(monto) {
  if (!metaFondoData) return
  const antes = metaFondoData.monto_objetivo
  const { error } = await dbClient.from('metas').update({ monto_objetivo: monto }).eq('id', metaFondoData.id).eq('usuario_id', window.currentUserId)
  if (error) { toast('Error: ' + error.message, 'err'); return }
  toast(`Meta en ${fmt(monto)}: realista`)
  metaFondoData.monto_objetivo = monto
  cargarMetas()
  return antes
}
// En el modal de crear meta: semáforo según el importe que escriba el usuario
function realismoModal() {
  const el = document.getElementById('m-realismo')
  if (!el || !calcMeta) return
  const monto = parseFloat(document.getElementById('m-monto').value) || 0
  if (!monto || !calcMeta.mesesRest) { el.hidden = true; return }
  const necesario = Math.max(0, monto - calcMeta.acumulado) / calcMeta.mesesRest
  const nivel = nivelRealismo(necesario, calcMeta.dispMensual, ahorroRealMedio)
  const nombres = { cumplida: 'Ya lo tienes', realista: 'Realista', ambiciosa: 'Ambiciosa', dificil: 'Difícil de cumplir' }
  el.hidden = false
  el.className = 'realismo mini ' + nivel
  el.innerHTML = `<span class="r-sem" aria-hidden="true"><i></i><i></i><i></i></span><div><b>${nombres[nivel]}</b><p>${nivel === 'dificil'
    ? `Exige ${fmt(Math.ceil(necesario))}/mes y tu plan deja ${fmt(Math.round(calcMeta.dispMensual))}. Te sugerimos ${fmt(Math.round(_metaMontoSugerido))}.`
    : `Exige ${fmt(Math.ceil(necesario))}/mes de los ${fmt(Math.round(calcMeta.dispMensual))} que deja tu plan.`}</p></div>`
}
document.getElementById('m-monto').addEventListener('input', realismoModal)

cargarMetas()
cargarIngresos()
cargarGastos()
cargarGastosRealMes()
cargarTipos()
cargarBudgetMode()
cargarPerfilAhorro()
cargarSeguimientoActivos()
document.addEventListener('click', () => {
  document.getElementById('apd-menu')?.classList.remove('apd-open')
  document.getElementById('apd-chev')?.classList.remove('apd-open')
})
actualizarPlanificador()

// Delegación de eventos en el contenedor estable de gastos
const _contGastos = document.getElementById('detalle-gastos')
_contGastos.addEventListener('focusin', e => {
  if (!e.target.matches('.variable-input')) return
  e.target.select()
  mostrarAnalisisFloat(e.target)
})
_contGastos.addEventListener('focusout', e => {
  if (!e.target.matches('.variable-input')) return
  ocultarAnalisisFloat()
})
_contGastos.addEventListener('input', e => {
  if (!e.target.matches('.variable-input')) return
  _antesPropuesta = null
  guardarGastosLocal()
  actualizarPlanificador()
  mostrarAnalisisFloat(e.target)
})
_contGastos.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return
  if (!e.target.matches('.variable-input')) return
  e.preventDefault()
  guardarGastosLocal()
  e.target.blur()
})
_contGastos.addEventListener('click', e => {
  const btn = e.target.closest('.btn-spin')
  if (!btn) return
  const inp = btn.closest('.var-row')?.querySelector('.variable-input')
  if (!inp) return
  const step = parseFloat(inp.step) || 1
  const cur  = parseFloat(inp.value) || 0
  inp.value  = btn.classList.contains('btn-spin-plus')
    ? Math.round(cur + step)
    : Math.max(0, Math.round(cur - step))
  inp.dispatchEvent(new Event('input', { bubbles: true }))
})
