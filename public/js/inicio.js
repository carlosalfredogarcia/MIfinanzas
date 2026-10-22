// inicio.html — se carga al final de la página, después de auth.js
// Fecha header
;(function(){
  const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const mesesN = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const d = new Date()
  const el = document.getElementById('header-dia')
  if(el) el.textContent = dias[d.getDay()] + ', ' + d.getDate() + ' de ' + mesesN[d.getMonth()]
})()

window.moneda = localStorage.getItem('moneda') || '$'
const _color = localStorage.getItem('color'); if(_color) document.documentElement.style.setProperty('--accent', _color)

// Importe en formato español (1.529,29) con la moneda del usuario; el € va detrás.
// Siempre con céntimos
const fmt = n => MF.dinero(n, 2)
const pctTxt = p => p.toFixed(1).replace('.', ',') + ' %'
const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const hoy = new Date().toISOString().split('T')[0]
let mesVer = new Date().getMonth()
let anioVer = new Date().getFullYear()

function actualizarCabecera() {
  document.getElementById('mes-badge').textContent = meses[mesVer] + ' ' + anioVer
}
actualizarCabecera()

function mesAnterior() { mesVer--; if(mesVer<0){mesVer=11;anioVer--} actualizarCabecera(); cargarDashboard() }
function mesSiguiente() { mesVer++; if(mesVer>11){mesVer=0;anioVer++} actualizarCabecera(); cargarDashboard() }

// Salud financiera: anillo, etiqueta y marcador de la barra
function actualizarSalud(pctGastado, saldo, totalIng) {
  const ring = document.getElementById('salud-ring')
  const badge = document.getElementById('salud-badge')
  const resto = document.getElementById('salud-resto')
  const circ = 2 * Math.PI * 54  // r=54 → 339,29

  if (totalIng <= 0) {
    ring.setAttribute('class', 'ring-fg')
    ring.style.strokeDashoffset = circ
    document.getElementById('salud-pct').textContent = '—'
    document.getElementById('salud-pct').className = 'ring-pct num'
    badge.textContent = 'Sin ingresos'
    badge.className = 'salud-badge warn'
    resto.innerHTML = 'Aún no has registrado ingresos este mes.' + (saldo < 0 ? ` Llevas <strong>${fmt(-saldo)}</strong> gastados.` : '')
    document.getElementById('salud-marker').style.left = '0%'
    document.getElementById('salud-svg').setAttribute('aria-label', 'Sin ingresos registrados este mes')
    return
  }

  const p = Math.max(0, pctGastado)
  ring.style.strokeDashoffset = circ * (1 - Math.min(1, p / 100))

  let estado, clase
  if (p < 80)       { estado = 'Bajo control'; clase = '' }
  else if (p <= 95) { estado = 'Atención';     clase = 'warn' }
  else              { estado = 'Al límite';    clase = 'danger' }
  ring.setAttribute('class', 'ring-fg' + (clase ? ' ' + clase : ''))  // en SVG, className no se puede asignar
  badge.textContent = estado
  badge.className = 'salud-badge' + (clase ? ' ' + clase : '')
  // El porcentaje se pone en rojo cuando el mes está al límite o pasado (más del 95 %).
  const pctEl = document.getElementById('salud-pct')
  pctEl.textContent = pctTxt(p)
  pctEl.className = 'ring-pct num' + (clase === 'danger' ? ' danger' : '')

  resto.innerHTML = saldo >= 0
    ? `Te quedan <strong>${fmt(saldo)}</strong> hasta fin de mes.`
    : `<span style="color:var(--red-txt)">Llevas ${fmt(-saldo)} en negativo.</span>`
  document.getElementById('salud-marker').style.left = Math.min(99, Math.max(1, p)) + '%'
  document.getElementById('salud-svg').setAttribute('aria-label', `Has gastado el ${pctTxt(p)} de tus ingresos. ${estado}.`)
}

// Línea de saldo a fin de mes de los últimos 6 meses (hasta el mes que se está viendo).
async function cargarSparkline(uid) {
  const meses6 = []
  for (let k = 5; k >= 0; k--) {
    const d = new Date(anioVer, mesVer - k, 1)
    const y = d.getFullYear(), m = d.getMonth()
    const ini = y + '-' + String(m + 1).padStart(2, '0') + '-01'
    const fin = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')
    meses6.push({ ini, fin, label: meses[m].slice(0, 3) })
  }
  const desde = meses6[0].ini, hasta = meses6[5].fin
  const [{ data: gas }, { data: ing }, { data: fij }] = await Promise.all([
    dbClient.from('gastos').select('fecha,monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
    dbClient.from('ingresos').select('fecha,monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta),
    dbClient.from('gastos_fijos').select('monto,fecha_inicio,fecha_fin').eq('usuario_id', uid).lte('fecha_inicio', hasta).or(`fecha_fin.gte.${desde},fecha_fin.is.null`)
  ])
  const suma = (rows, ini, fin) => (rows || []).filter(r => r.fecha >= ini && r.fecha <= fin).reduce((t, r) => t + parseFloat(r.monto), 0)
  const serie = meses6.map(({ ini, fin }) => {
    // Mismo criterio que el mes actual: el fijo cuenta si está activo en algún día del mes.
    const fijosMes = (fij || []).filter(f => f.fecha_inicio <= fin && (!f.fecha_fin || f.fecha_fin >= ini)).reduce((t, f) => t + parseFloat(f.monto), 0)
    return suma(ing, ini, fin) - suma(gas, ini, fin) - fijosMes
  })

  const max = Math.max(...serie), min = Math.min(...serie)
  const X = i => 29 + i * (292 / 5)
  const Y = v => 60 - ((v - min) / (max - min || 1)) * 50
  const pts = serie.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`)
  document.getElementById('spark-line').setAttribute('points', pts.join(' '))
  document.getElementById('spark-area').setAttribute('d', `M${pts[0]} L${pts.slice(1).join(' L')} L${X(5).toFixed(1)},64 L${X(0).toFixed(1)},64 Z`)
  ;['spark-halo', 'spark-dot'].forEach(id => {
    const c = document.getElementById(id)
    c.setAttribute('cx', X(5).toFixed(1)); c.setAttribute('cy', Y(serie[5]).toFixed(1))
  })
  document.getElementById('spark-months').innerHTML = meses6.map((m, i) => `<span${i === 5 ? ' class="active"' : ''}>${m.label}</span>`).join('')
  document.getElementById('spark-svg').setAttribute('aria-label',
    'Saldo a fin de mes: ' + meses6.map((m, i) => `${m.label} ${fmt(serie[i])}`).join(', '))
}

async function cargarDashboard() {
  let uid = window.currentUserId
  if (!uid) {
    uid = await new Promise(resolve => {
      const iv = setInterval(() => { if(window.currentUserId){clearInterval(iv);resolve(window.currentUserId)} }, 50)
      setTimeout(() => { clearInterval(iv); resolve(null) }, 5000)
    })
  }
  if (!uid) return

  const { data: perfil } = await dbClient.from('perfil').select('nombre').eq('usuario_id', uid).single()
  if (perfil?.nombre) {
    document.getElementById('saludo-nombre').textContent = 'Hola, ' + perfil.nombre
    document.getElementById('avatar-header').textContent = perfil.nombre[0].toUpperCase()
  }
  document.getElementById('header-saludo').style.visibility = 'visible'

  const inicio = anioVer + '-' + String(mesVer+1).padStart(2,'0') + '-01'
  const ultimoDia = new Date(anioVer, mesVer+1, 0).getDate()
  const fin = anioVer + '-' + String(mesVer+1).padStart(2,'0') + '-' + String(ultimoDia).padStart(2,'0')

  console.log('[dashboard] uid:', uid, 'inicio:', inicio, 'fin:', fin)
  const { data: todosIngresos } = await dbClient.from('ingresos').select('fecha,monto').eq('usuario_id', uid).order('fecha', { ascending: false }).limit(10)
  console.log('[dashboard] TODOS los ingresos del usuario (sin filtro de fecha):', todosIngresos)

  const [{ data: gastos, error: eGas }, { data: ingresos, error: eIng }, { data: fijos, error: eFij }] = await Promise.all([
    dbClient.from('gastos').select('*').eq('usuario_id', uid).gte('fecha', inicio).lte('fecha', fin),
    dbClient.from('ingresos').select('*').eq('usuario_id', uid).gte('fecha', inicio).lte('fecha', fin),
    dbClient.from('gastos_fijos').select('*').eq('usuario_id', uid).lte('fecha_inicio', fin).or(`fecha_fin.gte.${inicio},fecha_fin.is.null`)
  ])
  const { data: metas } = await dbClient.from('metas').select('*').eq('usuario_id', uid).eq('es_principal', true).maybeSingle()

  console.log('[dashboard] gastos mes:', gastos?.length, eGas?.message)
  console.log('[dashboard] ingresos mes:', ingresos, 'error:', eIng?.message)
  console.log('[dashboard] fijos:', fijos?.length, eFij?.message)

  const totalGas = (gastos   || []).reduce((s,g) => s + parseFloat(g.monto), 0)
  const totalIng = (ingresos || []).reduce((s,i) => s + parseFloat(i.monto), 0)
  const totalFij = (fijos    || []).reduce((s,f) => s + parseFloat(f.monto), 0)
  const saldo    = totalIng - totalGas - totalFij
  const totalGastadoTodo = totalGas + totalFij

  document.getElementById('total-ingresos').textContent = fmt(totalIng)
  document.getElementById('total-gastos').textContent   = fmt(totalGastadoTodo)
  document.getElementById('fijos-total').textContent    = fmt(totalFij)

  const saldoEl = document.getElementById('saldo-amount')
  saldoEl.className = 'saldo-amount num' + (saldo < 0 ? ' negativo' : '')
  saldoEl.textContent = fmt(saldo)
  cargarSparkline(uid)

  // Salud financiera
  const pctGastado = totalIng > 0 ? (totalGastadoTodo / totalIng) * 100 : 0
  actualizarSalud(pctGastado, saldo, totalIng)

  // Gastos fijos: de mayor a menor, cada uno con su % del total
  const listaFijos = document.getElementById('fijos-lista')
  listaFijos.innerHTML = ''
  const fijosOrden = [...(fijos || [])].sort((a, b) => parseFloat(b.monto) - parseFloat(a.monto))
  if (!fijosOrden.length) listaFijos.innerHTML = '<div class="vacio">Sin gastos fijos este mes</div>'
  fijosOrden.forEach(f => {
    const pct = totalFij > 0 ? Math.min(100, (parseFloat(f.monto) / totalFij) * 100) : 0
    const div = document.createElement('div')
    div.className = 'fijo-item'
    div.innerHTML = `
      <span class="fijo-icon" aria-hidden="true"></span>
      <span class="fijo-name"></span>
      <span class="fijo-amount num">${fmt(parseFloat(f.monto))}</span>
      <div class="fijo-bar-track"><div class="fijo-bar-fill" style="width:${pct.toFixed(1)}%"></div></div>
      <span class="fijo-pct num">${pctTxt(pct)}</span>
    `
    div.querySelector('.fijo-icon').textContent = (f.nombre || '?').trim()[0].toUpperCase()
    div.querySelector('.fijo-name').textContent = f.nombre
    listaFijos.appendChild(div)
  })

  const { data: ultimo } = await dbClient.from('gastos').select('*').eq('usuario_id', uid).order('fecha', { ascending: false }).limit(1)
  if (ultimo && ultimo.length > 0) {
    const u = ultimo[0]
    const cat = (u.categoria || '').trim()
    const primero = [...cat][0]
    const conEmoji = primero && primero.codePointAt(0) > 127
    const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const mesesAbr = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    const f = new Date(u.fecha + 'T00:00:00')
    const cuando = u.fecha === hoy ? 'Hoy' : u.fecha === ayer ? 'Ayer' : f.getDate() + ' ' + mesesAbr[f.getMonth()]
    const catTxt = conEmoji ? cat.slice(primero.length).trim() : cat
    document.getElementById('ultimo-icon').textContent  = conEmoji ? primero : '📋'
    document.getElementById('ultimo-desc').textContent  = u.descripcion
    document.getElementById('ultimo-date').textContent  = (catTxt ? catTxt + ' · ' : '') + cuando
    document.getElementById('ultimo-monto').textContent = fmt(-parseFloat(u.monto))
  }
}

cargarDashboard()

const CATS_DEFAULT = MF.CATS_DEFAULT

async function cargarCategoriasPerfil() {
  const uid = window.currentUserId
  if (!uid) return
  const { data: rows } = await dbClient.from('perfil').select('categorias').eq('usuario_id', uid).limit(1)
  const catsStr = rows?.[0]?.categorias || CATS_DEFAULT
  const cats = [...new Set(catsStr.split(',').map(c => c.trim()).filter(Boolean))]
  const defaults = CATS_DEFAULT.split(',').map(c => c.trim())
  const allCats = cats.concat(defaults.filter(d => !cats.includes(d)))
  const sk = s => s.replace(/^[^\p{L}]+/u, '').toLowerCase()
  allCats.sort((a,b) => sk(a).localeCompare(sk(b),'es'))
  ;['f-categoria'].forEach(id => {
    const sel = document.getElementById(id)
    if(sel) sel.innerHTML = allCats.map(c => `<option>${c}</option>`).join('')
  })
}

function toast(msg, tipo='ok') {
  const t = document.getElementById('toast')
  t.textContent = msg; t.className = `toast ${tipo} show`
  setTimeout(() => { t.className = 'toast' }, 2500)
}


function abrirIngreso() { document.getElementById('i-fecha').value=hoy; document.getElementById('modal-ingreso').style.display='flex' }
function cerrarIngreso() { document.getElementById('modal-ingreso').style.display='none' }
async function abrirGastoFijo() { document.getElementById('f-nombre').value=''; document.getElementById('f-monto').value=''; document.getElementById('f-fecha').value=''; document.getElementById('f-fecha-fin').value=''; await cargarCategoriasPerfil(); document.getElementById('modal-fijo').style.display='flex' }
function cerrarGastoFijo() { document.getElementById('modal-fijo').style.display='none' }


async function guardarIngreso() {
  const fecha=document.getElementById('i-fecha').value
  const concepto=document.getElementById('i-concepto').value.trim()
  const tipo=document.getElementById('i-tipo').value
  const monto=parseFloat(document.getElementById('i-monto').value)
  if (!concepto||isNaN(monto)) { alert('Completa concepto y monto'); return }
  const {error} = await dbClient.from('ingresos').insert([{fecha,concepto,tipo,monto,usuario_id:window.currentUserId,origen:'manual'}])
  if (error) { alert('Error: '+error.message) }
  else { alert('✅ Ingreso guardado'); cerrarIngreso(); cargarDashboard() }
}

async function guardarFijo() {
  const nombre=document.getElementById('f-nombre').value.trim()
  const categoria=document.getElementById('f-categoria').value
  const monto=parseFloat(document.getElementById('f-monto').value)
  const fecha=document.getElementById('f-fecha').value
  const fechaFin=document.getElementById('f-fecha-fin').value||null
  if (!nombre||isNaN(monto)||!fecha) { alert('Completa todos los campos'); return }
  const dia=new Date(fecha).getDate()
  const {error} = await dbClient.from('gastos_fijos').insert([{nombre,categoria,monto,dia_del_mes:dia,activo:true,fecha_inicio:fecha,fecha_fin:fechaFin,usuario_id:window.currentUserId}])
  if (error) { alert('Error: '+error.message) }
  else { alert('✅ Gasto fijo guardado'); cerrarGastoFijo(); cargarDashboard() }
}
