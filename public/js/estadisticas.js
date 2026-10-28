// mifinanza-estadisticas-v2.html — se carga al final de la página, después de auth.js
window.moneda = localStorage.getItem('moneda') || '$'
const _color = localStorage.getItem('color'); if (_color) document.documentElement.style.setProperty('--accent', _color)

const iconsCat = {
  'Comida':'🍔','Alquiler':'🏠','Remesas':'🌍','Línea':'📱',
  'Gym':'🏋️','Tecnología':'💻','Transporte':'🚗','Salud':'💊',
  'Ocio':'🎬','Ropa':'👕','Otros':'📦'
}

const MESES_LABELS  = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const MESES_NOMBRES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const CATS_DEFAULT = MF.CATS_DEFAULT

let datos           = []
let modoActual      = 'mes'
let periodoActual   = 2
let mesSeleccionado = null
let mesesPeriodo    = new Set()

let catsSliceActual   = []
let catsSoloMesActual = false
let categoriaAbierta  = null
let editandoItem      = null
let catElegida        = false  // la categoría de Evolución la eligió el usuario
let ingTotalResumen   = 0   // ingresos totales de lo que se está viendo, para la tasa de ahorro

async function cargarDatos() {
  const ok = await fetchDatos()
  if (!ok) return
  if (mesSeleccionado === null) mesSeleccionado = 0
  setModo('mes')
  const savedScroll = sessionStorage.getItem('stats-scroll')
  if (savedScroll) setTimeout(() => window.scrollTo(0, parseInt(savedScroll, 10)), 0)
}

async function recargarDatos() {
  const catAbiertaAntes = categoriaAbierta
  const mesSelKey = (mesSeleccionado !== null && datos[mesSeleccionado]) ? datos[mesSeleccionado].key : null
  const ok = await fetchDatos()
  if (!ok) return
  if (mesSelKey) {
    const idx = datos.findIndex(d => d.key === mesSelKey)
    mesSeleccionado = idx >= 0 ? idx : null
  }
  if (modoActual === 'periodo') renderPeriodo()
  else if (modoActual === 'mes') renderGridMeses()
  else renderAnio()
  if (catAbiertaAntes) { categoriaAbierta = catAbiertaAntes; renderCatsUI() }
}

async function fetchDatos() {
  let uid = window.currentUserId
  if (!uid) {
    uid = await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve(window.currentUserId) }
      }, 50)
      setTimeout(() => { clearInterval(iv); resolve(null) }, 5000)
    })
  }
  if (!uid) return
  const [
    { data: gastos,  error: errG },
    { data: ingresos, error: errI },
    { data: fijos,   error: errF }
  ] = await Promise.all([
    dbClient.from('gastos').select('id, fecha, monto, categoria, descripcion').eq('usuario_id', uid).order('fecha', { ascending: true }),
    dbClient.from('ingresos').select('fecha, monto').eq('usuario_id', uid).order('fecha', { ascending: true }),
    dbClient.from('gastos_fijos').select('id, monto, categoria, nombre, fecha_inicio, fecha_fin, dia_del_mes').eq('usuario_id', uid)
  ])

  if (errG || errI || errF) {
    document.getElementById('loading-wrap').textContent = 'Error al cargar datos.'
    return false
  }

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

  datos = Object.entries(mapa)
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

  if (datos.length === 0) {
    document.getElementById('loading-wrap').textContent = 'No hay datos aún.'
    return false
  }

  const todasCats = new Set()
  datos.forEach(d => Object.keys(d.cats).forEach(c => todasCats.add(c)))
  const sel = document.getElementById('cat-select')
  sel.innerHTML = ''
  todasCats.forEach(cat => {
    sel.innerHTML += `<option value="${cat}">${cat}</option>`
  })

  document.getElementById('loading-wrap').style.display = 'none'
  document.getElementById('contenido').style.display    = ''

  return true
}

function setModo(modo) {
  modoActual = modo
  ;['periodo','mes','anio'].forEach(m => {
    document.getElementById('tab-' + m).classList.toggle('active', m === modo)
  })
  document.getElementById('vista-periodo').style.display = modo === 'periodo' ? '' : 'none'
  document.getElementById('vista-mes').style.display     = modo === 'mes'     ? '' : 'none'
  document.getElementById('analisis-card').style.display = modo === 'mes'     ? 'none' : ''

  if (modo === 'periodo') renderPeriodo()
  if (modo === 'mes')     renderGridMeses()
  if (modo === 'anio')    renderAnio()
}

function toggleMesPeriodo(key) {
  if (mesesPeriodo.has(key)) mesesPeriodo.delete(key)
  else mesesPeriodo.add(key)
  renderPeriodo()
}

function renderPeriodo() {
  const grid     = document.getElementById('meses-sel-grid')
  const contador = document.getElementById('meses-sel-count')
  grid.innerHTML = ''

  const multiAnio = new Set(datos.map(d => d.anio)).size > 1
  const ordenados = [...datos].sort((a, b) => a.key.localeCompare(b.key))

  ordenados.forEach(d => {
    const chip = document.createElement('div')
    chip.className = 'mes-sel-chip' + (mesesPeriodo.has(d.key) ? ' seleccionado' : '')
    chip.textContent = multiAnio ? d.mes + ' \'' + String(d.anio).slice(2) : d.mes
    chip.setAttribute('onclick', `toggleMesPeriodo('${d.key}')`)
    grid.appendChild(chip)
  })

  const n = mesesPeriodo.size
  if (n === 0) {
    contador.textContent = 'Toca los meses que quieres comparar'
    setResumen('Prom. ingresos','—','','Prom. gastos','—','','Ahorro','—','', 0)
    document.getElementById('cats-wrap').innerHTML    = ''
    renderExtras([], false)
    return
  }

  contador.innerHTML = `<span>${n}</span> ${n === 1 ? 'mes seleccionado' : 'meses seleccionados'}`

  const slice = datos.filter(d => mesesPeriodo.has(d.key)).sort((a, b) => a.key.localeCompare(b.key))
  const tIng  = slice.reduce((s, d) => s + d.ingresos, 0)
  const tGas  = slice.reduce((s, d) => s + d.gastos,   0)
  const pIng  = Math.round(tIng / n)
  const pGas  = Math.round(tGas / n)

  // Saldo real acumulado: suma de (ingresos - gastos) de cada mes seleccionado.
  // d.gastos ya incluye los gastos fijos, así que no se restan aparte.
  const saldoTotal = Math.round(tIng - tGas)
  ingTotalResumen = tIng
  const esPositivo = saldoTotal >= 0
  const vSaldo = (esPositivo ? '+' : '−') + fmt(Math.abs(saldoTotal))

  setResumen(
    'Prom. ingresos', fmt(pIng), 'por mes',
    'Prom. gastos',   fmt(pGas), 'por mes',
    esPositivo ? 'Ahorraste en el período' : 'Tiraste del ahorro', vSaldo, `${n} ${n === 1 ? 'mes' : 'meses'}`, saldoTotal
  )

  dibujarCats(slice, false)
  renderAnalisis()
}

function renderGridMeses() {
  const grid = document.getElementById('meses-grid')
  grid.innerHTML = ''
  datos.forEach((d, i) => {
    const chip = document.createElement('div')
    chip.className = 'mes-chip' + (mesSeleccionado === i ? ' active' : '')
    chip.textContent = d.mes
    chip.onclick = () => seleccionarMes(i)
    grid.appendChild(chip)
  })

  const mesesConDatos = new Set(datos.map(d => d.key))
  MESES_LABELS.forEach((lbl, i) => {
    const key = `${datos[0].anio}-${String(i + 1).padStart(2, '0')}`
    if (!mesesConDatos.has(key)) {
      const chip = document.createElement('div')
      chip.className = 'mes-chip sin-datos'
      chip.textContent = lbl
      grid.appendChild(chip)
    }
  })

  if (mesSeleccionado !== null) renderMes(mesSeleccionado)
  else {
    document.getElementById('cats-wrap').innerHTML    = ''
    setResumen('Ingresos','—','','Gastos','—','','Ahorro','—','', 0)
    renderExtras([], true)
  }
}

function seleccionarMes(idx) {
  mesSeleccionado = idx
  renderGridMeses()
  renderMes(idx)
}

function renderMes(idx) {
  const d    = datos[idx]
  const prev = datos[idx + 1]
  const aho  = d.ingresos - d.gastos
  ingTotalResumen = d.ingresos

  setResumen(
    'Ingresos', fmt(d.ingresos), d.mesNombre,
    'Gastos',   fmt(d.gastos),   d.mesNombre,
    aho >= 0 ? 'Ahorraste este mes' : 'Tiraste del ahorro', (aho >= 0 ? '+' : '−') + fmt(Math.abs(aho)), d.mesNombre + ' ' + d.anio, aho
  )

  dibujarCats([d], true)
}

function renderAnio() {
  const tIng = datos.reduce((s, d) => s + d.ingresos, 0)
  const tGas = datos.reduce((s, d) => s + d.gastos,   0)
  const tAho = tIng - tGas
  ingTotalResumen = tIng

  setResumen(
    'Total ingresos', fmt(tIng), 'en el año',
    'Total gastos',   fmt(tGas), 'en el año',
    tAho >= 0 ? 'Llevas ahorrado' : 'Tiraste del ahorro', (tAho >= 0 ? '+' : '−') + fmt(Math.abs(tAho)), `en ${datos.length} ${datos.length === 1 ? 'mes' : 'meses'}`, tAho
  )

  dibujarCats(datos, false)
  renderAnalisis()
}

// Formato español con punto de miles (4.180) y la moneda del usuario; el € va detrás.
// Sin céntimos y sin signo: los gráficos ya dicen si es gasto o ahorro
const fmt = n => MF.dinero(Math.round(Math.abs(parseFloat(n || 0))), 0)

function setResumen(lIng, vIng, sIng, lGas, vGas, sGas, lAho, vAho, sAho, aho) {
  document.getElementById('lbl-ing').textContent = lIng
  document.getElementById('val-ing').textContent = vIng
  document.getElementById('sub-ing').textContent = sIng
  document.getElementById('lbl-gas').textContent = lGas
  document.getElementById('val-gas').textContent = vGas
  document.getElementById('sub-gas').textContent = sGas
  document.getElementById('lbl-aho').textContent = lAho
  document.getElementById('val-aho').textContent = vAho
  document.getElementById('sub-aho').textContent = sAho
  document.getElementById('val-aho').style.color = ''
  // Veredicto: ahorraste o tiraste del ahorro, con la tasa de ahorro sobre los ingresos
  const hero = document.querySelector('.hero')
  const sinDatos = vAho === '—'
  hero.classList.toggle('neg', !sinDatos && aho < 0)
  const ing = ingTotalResumen
  document.getElementById('tasa-aho').textContent = !sinDatos && ing > 0 ? `${aho >= 0 ? 'Guardaste' : 'Gastaste de más'} el ${Math.round(Math.abs(aho) / ing * 100)} % de lo que entró` : ''
}

function dibujarCats(slice, soloMes) {
  catsSliceActual   = slice
  catsSoloMesActual = soloMes
  categoriaAbierta  = null
  renderCatsUI()
  renderExtras(slice, soloMes)
}

function toggleCategoria(cat) {
  categoriaAbierta = categoriaAbierta === cat ? null : cat
  renderCatsUI()
}

function iconMov(esFijo, cat) {
  if (esFijo) return '<span style="color:#a5b4fc">↻</span>'
  if (!cat) return '📦'
  const first = [...cat.trim()][0]
  return first && first.codePointAt(0) > 127 ? first : (iconsCat[cat] || '📦')
}

function diaMes(fecha) {
  const [, mesNum, dia] = fecha.split('-').map(Number)
  return `${dia} ${MESES_LABELS[mesNum - 1]}`
}

// Tabla compacta: por categoría solo % del gasto, promedio al mes y total (en "Por mes", % y total).
// Tocar una fila abre sus movimientos para ubicar o editar un gasto.
function renderCatsUI() {
  const slice   = catsSliceActual
  const soloMes = catsSoloMesActual
  const totales = {}
  slice.forEach(d => Object.entries(d.cats).forEach(([cat, val]) => { totales[cat] = (totales[cat] || 0) + val }))
  const n    = slice.length
  const suma = Object.values(totales).reduce((t, v) => t + v, 0)
  const orden = Object.entries(totales).sort((a, b) => b[1] - a[1])

  document.getElementById('cats-title').textContent = n ? (soloMes ? slice[0].mesNombre + ' ' + slice[0].anio : `${n} ${n === 1 ? 'mes' : 'meses'}`) : ''
  document.getElementById('cat-cab').className = 'cat-cab' + (soloMes ? ' solo-mes' : '')
  document.getElementById('cat-cab').innerHTML = n ? `<span>Categoría</span><span>%</span>${soloMes ? '' : '<span>Media/mes</span>'}<span>Total</span>` : ''
  const wrap = document.getElementById('cats-wrap')
  wrap.innerHTML = ''

  orden.forEach(([cat, total], i) => {
    const abierta = categoriaAbierta === cat
    const row = document.createElement('div')
    row.className = 'cat-row' + (abierta ? ' abierta' : '') + (soloMes ? ' solo-mes' : '')
    row.setAttribute('role', 'listitem')
    row.dataset.cat = cat
    row.innerHTML = `
      <button type="button" class="cat-fila" aria-expanded="${abierta}">
        <span class="cat-nom"><i style="background:${i < 5 ? COLORES[i] : COLORES[5]}"></i><span class="cat-txt"></span></span>
        <span class="cat-pct num">${Math.round(total / suma * 100)}</span>
        ${soloMes ? '' : `<span class="cat-prom num">${fmt(total / n)}</span>`}
        <span class="cat-tot num">${fmt(total)}</span>
      </button>`
    row.querySelector('.cat-txt').textContent = cat
    row.querySelector('.cat-fila').addEventListener('click', () => toggleCategoria(cat))

    if (abierta) {
      const movs = slice.flatMap(d => d.movs[cat] || []).sort((a, b) => b.fecha.localeCompare(a.fecha))
      const movsWrap = document.createElement('div')
      movsWrap.className = 'cat-movs'
      if (!movs.length) movsWrap.innerHTML = '<div class="cat-movs-empty">Sin movimientos en este período.</div>'
      movs.forEach(m => {
        const item = document.createElement('button')
        item.type = 'button'
        item.className = 'cat-mov-item'
        item.innerHTML = `
          <div class="cm-info"><div class="cm-nombre"></div><div class="cm-fecha">${diaMes(m.fecha)} ${m.fecha.slice(0, 4)}${m.tipo === 'fijo' ? ' · fijo' : ''}</div></div>
          <div class="cm-monto num">${fmt(m.monto)}</div>
          <div class="cm-edit" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16Z"/></svg></div>`
        item.querySelector('.cm-nombre').textContent = m.label
        item.setAttribute('aria-label', `Editar ${m.label}, ${fmt(m.monto)}`)
        item.addEventListener('click', () => abrirEdicionItem(m))
        movsWrap.appendChild(item)
      })
      row.appendChild(movsWrap)
    }
    wrap.appendChild(row)
  })
}

function renderAnalisis() {
  const sel   = document.getElementById('cat-select')
  const slice = modoActual === 'anio'
    ? [...datos].reverse()
    : datos.filter(d => mesesPeriodo.has(d.key)).sort((a, b) => a.key.localeCompare(b.key))
  if (!slice.length) return
  // Hasta que el usuario elija, se enseña la categoría que más ha variado: es la que cuenta una historia
  if (!catElegida) {
    let mejor = null, mayor = -1
    ;[...sel.options].map(o => o.value).forEach(c => {
      const v = slice.map(d => d.cats[c] || 0), m = v.reduce((t, x) => t + x, 0) / v.length
      const desv = m ? Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / v.length) : 0
      if (desv > mayor) { mayor = desv; mejor = c }
    })
    if (mejor) sel.value = mejor
  }
  const cat = sel.value
  if (!cat) return

  // Chips: categorías del período, de mayor a menor gasto
  const tot = {}
  slice.forEach(d => Object.entries(d.cats).forEach(([c, v]) => { tot[c] = (tot[c] || 0) + v }))
  const chips = document.getElementById('cat-chips')
  chips.innerHTML = ''
  Object.entries(tot).sort((a, b) => b[1] - a[1]).forEach(([c]) => {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'cat-chip' + (c === cat ? ' active' : '')
    b.setAttribute('aria-pressed', String(c === cat))
    b.textContent = c
    b.addEventListener('click', () => { sel.value = c; catElegida = true; renderAnalisis() })
    chips.appendChild(b)
  })
  // Centra el chip activo moviendo solo la fila de chips (scrollIntoView movía toda la página)
  const act = chips.querySelector('.active')
  if (act) chips.scrollLeft = act.offsetLeft - (chips.clientWidth - act.offsetWidth) / 2

  const vals = slice.map(d => d.cats[cat] || 0)
  const maxV = Math.max(...vals) || 1
  const prom = vals.reduce((t, v) => t + v, 0) / vals.length
  const iMax = vals.indexOf(Math.max(...vals))
  const multiAnio = new Set(slice.map(d => d.anio)).size > 1
  const wrap = document.getElementById('evol-barras')
  wrap.innerHTML = ''
  const ALTO = 110  // px de la barra más alta
  vals.forEach((v, i) => {
    const tipo = i === iMax && v > 0 ? 'max' : v > prom * 1.1 ? 'alto' : v < prom * 0.9 ? 'bajo' : ''
    const col = document.createElement('div')
    col.className = 'evol-col ' + tipo
    col.innerHTML = `<b>${v ? fmt(v) : '—'}</b><i style="height:${Math.max(3, Math.round(v / maxV * ALTO))}px;animation-delay:${i * 50}ms"></i><span>${slice[i].mes}${multiAnio ? " '" + String(slice[i].anio).slice(2) : ''}</span>`
    wrap.appendChild(col)
  })
  if (prom > 0) {
    const linea = document.createElement('div')
    linea.className = 'evol-prom'
    linea.style.bottom = (22 + Math.round(prom / maxV * ALTO)) + 'px'
    wrap.appendChild(linea)
  }
  document.getElementById('evol-leyenda').innerHTML = prom > 0
    ? `<span><i class="lg-prom"></i>Promedio ${fmt(prom)}/mes</span><span><i class="lg-max"></i>Mes más alto</span><span><i class="lg-alto"></i>Sobre el promedio</span><span><i class="lg-bajo"></i>Bajo el promedio</span>` : ''
  wrap.scrollLeft = wrap.scrollWidth  // empieza mostrando los meses recientes

  document.getElementById('analisis-nota').textContent = resumenMeses(slice)
}

// ── Utilidades ──
// Quita el emoji inicial (y su selector de variante) de una categoría: "⚠️ Gastos Imprevistos" → "Gastos Imprevistos"
const sinEmoji = c => (c || '').trim().replace(/^[^\p{L}\p{N}]+/u, '').trim()
// Colores del anillo: las 5 categorías mayores y el resto (gris)
const COLORES = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#38bdf8', '#64748b']
// ── Anillo del panel "¿A dónde va tu dinero?" ──
function renderExtras(slice, soloMes) {
  document.getElementById('donut-card').hidden = !slice.length
  if (slice.length) renderDonut(slice)
}

function renderDonut(slice) {
  const tot = {}
  slice.forEach(d => Object.entries(d.cats).forEach(([c, v]) => { tot[c] = (tot[c] || 0) + v }))
  const orden = Object.entries(tot).sort((a, b) => b[1] - a[1])
  const suma = orden.reduce((t, [, v]) => t + v, 0)
  const partes = orden.slice(0, 5)
  const resto = orden.slice(5).reduce((t, [, v]) => t + v, 0)
  if (resto > 0) partes.push(['Resto', resto])
  const R = 58, C = 2 * Math.PI * R
  let acum = 0
  const svg = document.getElementById('donut')
  svg.innerHTML = partes.map(([c, v], i) => {
    const largo = suma ? v / suma * C : 0
    const seg = `<circle class="tramo" data-cat="${i < 5 ? encodeURIComponent(c) : ''}" cx="80" cy="80" r="${R}" stroke="${COLORES[i]}"
      stroke-dasharray="${Math.max(0, largo - 2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}"
      transform="rotate(-90 80 80)" style="animation-delay:${i * 80}ms"><title>${sinEmoji(c)}: ${fmt(v)}</title></circle>`
    acum += largo
    return seg
  }).join('') + `<text class="donut-centro-v" x="80" y="82" text-anchor="middle">${fmt(suma)}</text><text class="donut-centro-l" x="80" y="99" text-anchor="middle">GASTADO</text>`
  svg.querySelectorAll('.tramo[data-cat]').forEach(t => { if (t.dataset.cat) t.addEventListener('click', () => abrirCategoria(decodeURIComponent(t.dataset.cat))) })
}

// Abre la categoría en la tabla y la lleva a la vista
function abrirCategoria(cat) {
  categoriaAbierta = cat
  renderCatsUI()
  const fila = [...document.querySelectorAll('.cat-row')].find(r => r.dataset.cat === cat)
  if (fila) fila.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

// Resumen del período: mejor mes y meses en que se gastó más de lo que entró
function resumenMeses(slice) {
  slice = [...slice].sort((a, b) => a.key.localeCompare(b.key))
  if (slice.length < 2) return ''
  const ahorros = slice.map(d => d.ingresos - d.gastos)
  const iMejor = ahorros.indexOf(Math.max(...ahorros))
  const neg = slice.filter(d => d.gastos > d.ingresos)
  return (ahorros[iMejor] > 0 ? `Tu mejor mes fue ${slice[iMejor].mesNombre.toLowerCase()}: ahorraste ${fmt(ahorros[iMejor])}. ` : '') +
    (neg.length ? `En ${neg.length} ${neg.length === 1 ? 'mes' : 'meses'} gastaste más de lo que entró (${neg.map(d => d.mes).join(', ')}).` : 'Ningún mes gastaste más de lo que entró.')
}

// ── ¿Cuándo fue la última vez? (busca en todos los meses) ──
;(function () {
  const input = document.getElementById('busca-input'), res = document.getElementById('busca-res')
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    res.innerHTML = ''
    if (q.length < 2) return
    const grupos = {}
    datos.forEach(d => Object.values(d.movs).flat().forEach(m => {
      if (!(m.label || '').toLowerCase().includes(q) && !(m.categoria || '').toLowerCase().includes(q)) return
      const k = (m.label || '').trim().toLowerCase()
      ;(grupos[k] = grupos[k] || { nombre: m.label, fechas: [], total: 0, cat: m.categoria }).fechas.push(m.fecha)
      grupos[k].total += m.monto
    }))
    const ultimo = l => l[l.length - 1]
    const lista = Object.values(grupos).sort((a, b) => ultimo(b.fechas.sort()).localeCompare(ultimo(a.fechas.sort()))).slice(0, 4)
    if (!lista.length) { res.innerHTML = '<p class="br-vacio">No encuentro ningún gasto con ese nombre.</p>'; return }
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
    const fechaTxt = d => `${d.getDate()} ${MESES_LABELS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`
    lista.forEach(g => {
      const f = [...new Set(g.fechas)].sort()
      const ult = new Date(ultimo(f) + 'T00:00:00')
      const hace = Math.round((hoy - ult) / 86400000)
      const cada = f.length > 1 ? Math.round((new Date(ultimo(f)) - new Date(f[0])) / 86400000 / (f.length - 1)) : null
      const frecTxt = !cada ? 'Solo una vez'
        : cada <= 10 ? `Cada ${cada} días · casi semanal`
        : cada <= 45 ? `Cada ${cada} días · ~${(30 / cada).toFixed(1).replace('.0', '').replace('.', ',')} ${30 / cada >= 1.5 ? 'veces' : 'vez'} al mes`
        : `Cada ${cada} días · ~cada ${Math.round(cada / 30)} meses`
      const prox = cada ? new Date(ult.getTime() + cada * 86400000) : null
      // Línea de tiempo: los meses de los datos, marcados donde hubo este gasto
      const mesesTL = [...datos].reverse().map(d => d.key)
      const conGasto = new Set(f.map(x => x.slice(0, 7)))
      const el = document.createElement('div')
      el.className = 'br-item'
      el.innerHTML = `
        <div class="br-nombre"></div>
        <div class="br-stats">
          <div class="br-stat"><span>Última vez</span><b>${fechaTxt(ult)}</b><em>${hace === 0 ? 'Hoy' : hace > 0 ? `Hace ${hace} ${hace === 1 ? 'día' : 'días'}` : `Dentro de ${-hace} días`}</em></div>
          <div class="br-stat"><span>Frecuencia</span><b>${cada ? `Cada ${cada} días` : '1 vez'}</b><em>${frecTxt.split(' · ')[1] || 'sin repetir aún'}</em></div>
        </div>
        <div class="br-tl" aria-label="Meses en los que hubo este gasto">${mesesTL.map(k => `<i class="${conGasto.has(k) ? 'si' : ''}" title="${MESES_LABELS[+k.slice(5) - 1]} ${k.slice(0, 4)}"></i>`).join('')}</div>
        <div class="br-meta">${f.length} ${f.length === 1 ? 'vez' : 'veces'} · ${fmt(g.total)} en total${prox && prox > hoy ? ` · si sigues igual, la próxima sería hacia el ${prox.getDate()} ${MESES_LABELS[prox.getMonth()].toLowerCase()}` : ''}</div>`
      el.querySelector('.br-nombre').textContent = `${iconMov(false, g.cat)} ${g.nombre}`
      res.appendChild(el)
    })
  })
})()

async function cargarCategoriasPerfil() {
  const uid = window.currentUserId
  if (!uid) return
  const { data: rows } = await dbClient.from('perfil').select('categorias').eq('usuario_id', uid).limit(1)
  const catsStr = rows?.[0]?.categorias || CATS_DEFAULT
  const cats = [...new Set(catsStr.split(',').map(c => c.trim()).filter(Boolean))]
  const defaults = CATS_DEFAULT.split(',').map(c => c.trim())
  const allCats = cats.concat(defaults.filter(d => !cats.includes(d)))
  const sk = s => s.replace(/^[^\p{L}]+/u, '').toLowerCase()
  allCats.sort((a, b) => sk(a).localeCompare(sk(b), 'es'))
  ;['em-categoria', 'em-cat-fijo'].forEach(id => {
    const sel = document.getElementById(id)
    if (sel) sel.innerHTML = allCats.map(c => `<option>${c}</option>`).join('')
  })
}

function setSelectValue(id, val) {
  const sel = document.getElementById(id)
  ;[...sel.options].forEach(o => { if (o.value === val) sel.value = val })
}

async function abrirEdicionItem(m) {
  editandoItem = m
  const esFijo = m.tipo === 'fijo'
  await cargarCategoriasPerfil()
  document.getElementById('edit-title').textContent = esFijo ? 'Editar gasto fijo' : 'Editar gasto'
  document.getElementById('lbl-em-fecha').textContent = esFijo ? 'Fecha de inicio' : 'Fecha'
  document.getElementById('fld-em-descripcion').style.display = esFijo ? 'none' : ''
  document.getElementById('fld-em-nombre').style.display      = esFijo ? '' : 'none'
  document.getElementById('fld-em-categoria').style.display   = esFijo ? 'none' : ''
  document.getElementById('fld-em-cat-fijo').style.display    = esFijo ? '' : 'none'
  document.getElementById('em-fecha').value = m.fecha
  document.getElementById('em-monto').value = m.monto
  if (esFijo) {
    document.getElementById('em-nombre').value = m.label
    setSelectValue('em-cat-fijo', m.categoria)
  } else {
    document.getElementById('em-descripcion').value = m.label
    setSelectValue('em-categoria', m.categoria)
  }
  document.getElementById('modal-editar-item').style.display = 'flex'
}

function cerrarEdicionItem() {
  document.getElementById('modal-editar-item').style.display = 'none'
  editandoItem = null
}

async function guardarEdicionItem() {
  if (!editandoItem) return
  const fecha = document.getElementById('em-fecha').value
  const monto = parseFloat(document.getElementById('em-monto').value)
  if (!fecha || isNaN(monto)) { alert('Completa todos los campos'); return }

  let error
  if (editandoItem.tipo === 'fijo') {
    const nombre    = document.getElementById('em-nombre').value.trim()
    const categoria = document.getElementById('em-cat-fijo').value
    if (!nombre) { alert('Completa el nombre'); return }
    const dia = new Date(fecha + 'T00:00:00').getDate()
    ;({ error } = await dbClient.from('gastos_fijos')
      .update({ nombre, categoria, monto, fecha_inicio: fecha, dia_del_mes: dia })
      .eq('id', editandoItem.id).eq('usuario_id', window.currentUserId))
  } else {
    const descripcion = document.getElementById('em-descripcion').value.trim()
    const categoria    = document.getElementById('em-categoria').value
    if (!descripcion) { alert('Completa la descripción'); return }
    ;({ error } = await dbClient.from('gastos')
      .update({ fecha, descripcion, categoria, monto })
      .eq('id', editandoItem.id).eq('usuario_id', window.currentUserId))
  }

  if (error) { alert('Error: ' + error.message); return }
  cerrarEdicionItem()
  await recargarDatos()
}

window.addEventListener('pagehide', () => {
  sessionStorage.setItem('stats-scroll', window.scrollY)
})

cargarDatos()
