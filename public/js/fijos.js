// mifinanza-fijos.html — se carga al final de la página, después de auth.js
window.moneda = localStorage.getItem('moneda') || '$'
const CATS_DEFAULT = MF.CATS_GASTO
// Categorías típicas de un gasto fijo: salen primero en la hoja
const CATS_FIJO = ['🏠 Alquiler', '💡 Luz', '💧 Agua', '🌐 Internet', '📱 Línea', '📺 Suscripción', '🏋️ Gym', '💳 Crédito']
// Grupos de la lista, por palabras de la categoría (vale también para categorías propias)
const GRUPOS = [
  { nombre: 'Casa y suministros', claves: ['alquiler', 'hipoteca', 'luz', 'agua', 'gas', 'internet', 'comunidad', 'seguro hogar'] },
  { nombre: 'Suscripciones y cuotas', claves: ['suscrip', 'línea', 'linea', 'gym', 'tecnolog', 'móvil', 'movil', 'streaming'] },
  { nombre: 'Créditos y préstamos', claves: ['crédito', 'credito', 'préstamo', 'prestamo', 'tarjeta', 'financ'] },
]
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

let fijos = [], gastos = [], ingresos = [], categorias = []
let editando = null

// ── Utilidades ─────────────────────────────────────────────
const { esc, pad, fechaLocal, sinEmoji } = MF
const fmt = (n, dec) => MF.dinero(n, dec)
const mesDe = f => (f || '').slice(0, 7)
const mesActual = () => fechaLocal().slice(0, 7)
const sumarMes = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}` }
const diasMes = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate()
const nombreMes = m => MESES[+m.slice(5, 7) - 1] + (m.slice(0, 4) !== mesActual().slice(0, 4) ? ' ' + m.slice(0, 4) : '')
const emoji = c => MF.emoji(c)
const parseImporte = v => parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
const importeTxt = n => (n % 1 ? Number(n).toFixed(2) : String(n)).replace('.', ',')
// Mismo criterio que Movimientos, Estadísticas y Metas: cuenta en los meses entre inicio y fin
const cuentaEnMes = (f, m) => mesDe(f.fecha_inicio) <= m && (!f.fecha_fin || mesDe(f.fecha_fin) >= m)
const diaCobro = (f, m) => Math.min(f.dia_del_mes || +String(f.fecha_inicio).slice(8, 10) || 1, diasMes(m))
const claveTexto = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\d+/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim()
const palabras = t => claveTexto(t).split(' ').filter(p => p.length >= 3)
const parecido = (a, b) => { const pa = palabras(a), pb = new Set(palabras(b)); return pa.some(p => pb.has(p)) }
const importeCerca = (a, b) => Math.abs(a - b) <= Math.max(1, b * 0.03)
// «TRANSF ALQUILER PISO» → «Transf alquiler piso»
const bonito = t => { const s = String(t || '').trim(); return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s }
const mediana = arr => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const grupoDe = cat => { const c = claveTexto(cat); return (GRUPOS.find(g => g.claves.some(k => c.includes(claveTexto(k)))) || { nombre: 'Otros' }).nombre }

// ── Datos ─────────────────────────────────────────────────
async function esperarSesion() {
  for (let i = 0; i < 100 && !window.currentUserId; i++) await new Promise(r => setTimeout(r, 50))
  return window.currentUserId
}

async function cargarFijos() {
  const uid = await esperarSesion()
  if (!uid) return
  const desde = sumarMes(mesActual(), -6) + '-01'
  const [rF, rG, rI, rP] = await Promise.all([
    dbClient.from('gastos_fijos').select('*').eq('usuario_id', uid).order('created_at'),
    dbClient.from('gastos').select('id, fecha, descripcion, categoria, monto, origen').eq('usuario_id', uid).gte('fecha', desde).order('fecha', { ascending: false }),
    dbClient.from('ingresos').select('fecha, monto').eq('usuario_id', uid).gte('fecha', sumarMes(mesActual(), -3) + '-01'),
    dbClient.from('perfil').select('categorias').eq('usuario_id', uid).limit(1),
  ])
  if (rF.error) { document.getElementById('contenido').innerHTML = '<div class="cargando">No se pudieron cargar tus gastos fijos</div>'; return }
  fijos = rF.data || []
  gastos = (rG.data || []).map(g => ({ ...g, monto: +g.monto }))
  ingresos = rI.data || []
  const propias = (rP.data?.[0]?.categorias || '').split(',').map(c => c.trim()).filter(Boolean)
  categorias = [...new Set([...CATS_FIJO, ...propias, ...CATS_DEFAULT.split(','), ...fijos.map(f => f.categoria).filter(Boolean)])]
  render()
}

// Ingresos de referencia: media de los 3 últimos meses cerrados; si no hay, los de este mes
function ingresoMensual() {
  const m = mesActual(), porMes = {}
  for (const i of ingresos) porMes[mesDe(i.fecha)] = (porMes[mesDe(i.fecha)] || 0) + +i.monto
  const cerrados = [1, 2, 3].map(k => porMes[sumarMes(m, -k)]).filter(v => v > 0)
  if (cerrados.length) return cerrados.reduce((a, b) => a + b, 0) / cerrados.length
  return porMes[m] || 0
}

// Movimientos que repiten un gasto fijo del mismo mes (normalmente al importar el extracto del banco)
function duplicados() {
  const out = []
  for (const g of gastos) {
    const m = mesDe(g.fecha)
    const f = fijos.find(f => cuentaEnMes(f, m) && importeCerca(g.monto, +f.monto) && (g.categoria === f.categoria || parecido(g.descripcion, f.nombre)))
    if (f) out.push({ g, f })
  }
  return out
}

// Gastos que se repiten cada mes con importe parecido y aún no son fijos
function sugerencias() {
  const descartadas = JSON.parse(localStorage.getItem('fijos-descartados') || '[]')
  const grupos = new Map()
  for (const g of gastos) {
    const k = claveTexto(g.descripcion)
    if (!k || descartadas.includes(k)) continue
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(g)
  }
  const out = []
  for (const [k, lista] of grupos) {
    const porMes = {}
    for (const g of lista) (porMes[mesDe(g.fecha)] = porMes[mesDe(g.fecha)] || []).push(g)
    const meses = Object.keys(porMes).sort()
    if (meses.length < 3) continue
    // Una vez al mes: si en algún mes hay varios, es un gasto frecuente, no uno fijo
    if (meses.some(m => porMes[m].length > 1)) continue
    const montos = lista.map(g => g.monto), med = mediana(montos)
    if (montos.some(v => Math.abs(v - med) > Math.max(1, med * 0.1))) continue
    const ultimo = lista[0]
    // Ya es un fijo (se cuenta dos veces): eso lo avisa «Se cuentan dos veces», no aquí
    if (fijos.some(f => importeCerca(med, +f.monto) && (f.categoria === ultimo.categoria || parecido(f.nombre, ultimo.descripcion)))) continue
    out.push({ clave: k, nombre: bonito(ultimo.descripcion), categoria: ultimo.categoria, monto: med, meses: meses.length, dia: mediana(lista.map(g => +g.fecha.slice(8, 10))), ultimoMes: meses[meses.length - 1] })
  }
  return out.sort((a, b) => b.meses - a.meses || b.monto - a.monto).slice(0, 3)
}

// ── Pintar ─────────────────────────────────────────────────
function render() {
  const m = mesActual(), hoy = new Date().getDate()
  const activos = fijos.filter(f => cuentaEnMes(f, m))
  const futuros = fijos.filter(f => mesDe(f.fecha_inicio) > m)
  const pasados = fijos.filter(f => f.fecha_fin && mesDe(f.fecha_fin) < m)
  const cont = document.getElementById('contenido')

  if (!fijos.length) {
    cont.innerHTML = `<section class="seccion"><div class="tarjeta vacio">
      <b>Aún no tienes gastos fijos</b>
      <p>Añade lo que pagas cada mes —alquiler, luz, internet, el gimnasio, una cuota— y se apuntará solo todos los meses.</p>
      <button type="button" class="btn-grande" onclick="abrirModal()">Añadir gasto fijo</button>
    </div></section>${htmlSugerencias()}`
    enlazar(); return
  }

  const total = activos.reduce((s, f) => s + +f.monto, 0)
  const pagado = activos.filter(f => diaCobro(f, m) <= hoy).reduce((s, f) => s + +f.monto, 0)
  const ing = ingresoMensual()
  const pctIng = ing > 0 ? Math.round(total / ing * 100) : null

  let html = `<section class="resumen" aria-label="Resumen">
    <div class="res-lbl">Tus fijos este mes</div>
    <div class="res-total num">${fmt(total)}</div>
    <div class="res-sub">${activos.length} pago${activos.length === 1 ? '' : 's'}${pctIng !== null ? ` · <b>el ${pctIng} %</b> de lo que entra` : ''}</div>
    <div class="res-barra" role="img" aria-label="Pagado ${fmt(pagado)} de ${fmt(total)}"><i style="width:${total ? pagado / total * 100 : 0}%"></i></div>
    <div class="res-pie"><span>Ya salieron <b class="num">${fmt(pagado)}</b></span><span>Faltan <b class="num">${fmt(total - pagado)}</b></span></div>
  </section>`

  // Próximos cobros: lo que falta este mes y, si ya salió todo, lo primero del mes que viene
  let prox = activos.filter(f => diaCobro(f, m) >= hoy).map(f => ({ f, dias: diaCobro(f, m) - hoy, mes: m }))
  if (prox.length < 2) {
    const sig = sumarMes(m, 1), restan = diasMes(m) - hoy
    prox = prox.concat(fijos.filter(f => cuentaEnMes(f, sig)).map(f => ({ f, dias: restan + diaCobro(f, sig), mes: sig })))
  }
  prox = prox.sort((a, b) => a.dias - b.dias).slice(0, 6)
  if (prox.length) {
    html += `<section class="seccion"><div class="sec-tit"><span>Próximos cobros</span></div><div class="prox">${prox.map(({ f, dias, mes }) => {
      const cuando = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : dias <= 7 ? `En ${dias} días` : `${diaCobro(f, mes)} ${MESES[+mes.slice(5, 7) - 1]}`
      return `<button type="button" class="prox-item${dias <= 1 ? ' hoy' : ''}" data-editar="${esc(f.id)}" style="text-align:left;color:inherit;cursor:pointer">
        <div class="prox-cuando">${cuando}</div><div class="prox-nom">${esc(emoji(f.categoria))} ${esc(f.nombre)}</div><div class="prox-monto num">${fmt(f.monto)}</div></button>`
    }).join('')}</div></section>`
  }

  html += htmlDuplicados() + htmlSugerencias()

  // Lista por grupos
  const porGrupo = {}
  for (const f of [...activos].sort((a, b) => b.monto - a.monto)) (porGrupo[grupoDe(f.categoria)] = porGrupo[grupoDe(f.categoria)] || []).push(f)
  const orden = [...GRUPOS.map(g => g.nombre), 'Otros'].filter(n => porGrupo[n])
  html += orden.map(n => {
    const lista = porGrupo[n], sub = lista.reduce((s, f) => s + +f.monto, 0)
    return `<section class="seccion grupo"><div class="sec-tit"><span>${n}</span><span class="num">${fmt(sub)} al mes</span></div>
      <div class="tarjeta">${lista.map(f => filaHtml(f, m)).join('')}</div></section>`
  }).join('')

  if (futuros.length) html += `<section class="seccion"><div class="sec-tit"><span>Empiezan más adelante</span></div><div class="tarjeta">${futuros.map(f => filaHtml(f, m)).join('')}</div></section>`
  if (pasados.length) html += `<details class="seccion plegable"><summary><div class="sec-tit"><span>Ya no pagas (${pasados.length})</span><span>se conservan en tu historial</span></div></summary>
    <div class="tarjeta">${pasados.map(f => filaHtml(f, m)).join('')}</div></details>`

  cont.innerHTML = html
  enlazar()
}

function filaHtml(f, m) {
  const fin = f.fecha_fin && mesDe(f.fecha_fin)
  let sub = `Día ${diaCobro(f, m)}`
  if (mesDe(f.fecha_inicio) > m) sub += ` · empieza en ${nombreMes(mesDe(f.fecha_inicio))}`
  else if (fin && fin < m) sub = `De ${nombreMes(mesDe(f.fecha_inicio))} a ${nombreMes(fin)}`
  else sub += ` · desde ${nombreMes(mesDe(f.fecha_inicio))}`
  const etq = fin === m ? '<span class="etq etq-gold">último mes</span>' : fin && fin > m ? `<span class="etq etq-ind">hasta ${nombreMes(fin)}</span>` : ''
  return `<button type="button" class="fila${fin && fin < m ? ' inactivo' : ''}" data-editar="${esc(f.id)}">
    <span class="ico">${esc(emoji(f.categoria))}</span>
    <span class="fila-info"><span class="fila-nom" style="display:block">${esc(f.nombre)}${etq}</span><span class="fila-sub" style="display:block">${sub}</span></span>
    <span class="fila-monto num">${fmt(f.monto)}</span></button>`
}

function htmlDuplicados() {
  const d = duplicados()
  if (!d.length) return ''
  const extra = d.reduce((s, x) => s + x.g.monto, 0)
  return `<section class="seccion"><div class="aviso aviso-rojo">
    <div class="aviso-tit">⚠️ Se cuentan dos veces</div>
    <div class="aviso-txt">Estos movimientos coinciden con un gasto fijo del mismo mes (suele pasar al importar el banco). Tus gastos aparecen ${fmt(extra)} más altos de lo real.</div>
    ${d.slice(0, 6).map(({ g, f }) => `<div class="aviso-fila">
      <span class="fila-info"><b>${esc(bonito(g.descripcion))}</b> · <span class="num">${fmt(g.monto)}</span><br><span style="color:var(--subtext)">${+g.fecha.slice(8, 10)} ${MESES[+g.fecha.slice(5, 7) - 1]} · ya está en tu fijo «${esc(f.nombre)}»</span></span>
      <button type="button" class="btn-mini peligro" data-quitar="${esc(g.id)}">Quitar</button></div>`).join('')}
    ${d.length > 6 ? `<div class="aviso-fila"><span class="fila-info">Y ${d.length - 6} más</span><button type="button" class="btn-mini peligro" data-quitar-todos>Quitar todos</button></div>` : ''}
  </div></section>`
}

function htmlSugerencias() {
  const s = sugerencias()
  if (!s.length) return ''
  return `<section class="seccion">${s.map((x, i) => `<div class="aviso aviso-ind">
    <div class="aviso-tit">${esc(emoji(x.categoria))} ¿«${esc(x.nombre)}» es un gasto fijo?</div>
    <div class="aviso-txt">Aparece ${x.meses} meses, siempre por unos <b class="num" style="color:var(--text)">${fmt(x.monto)}</b>. Si lo añades, se apuntará solo a partir de ${nombreMes(sumarMes(x.ultimoMes, 1))}.</div>
    <div class="aviso-fila" style="border:0;padding-top:4px"><button type="button" class="btn-mini prim" data-sug="${i}">Añadir como fijo</button><button type="button" class="btn-texto" data-descartar="${i}">No es fijo</button></div>
  </div>`).join('')}</section>`
}

function enlazar() {
  document.querySelectorAll('[data-editar]').forEach(b => b.addEventListener('click', () => editarFijo(b.dataset.editar)))
  document.querySelectorAll('[data-quitar]').forEach(b => b.addEventListener('click', () => quitarDuplicados([b.dataset.quitar])))
  const todos = document.querySelector('[data-quitar-todos]')
  if (todos) todos.addEventListener('click', () => quitarDuplicados(duplicados().map(x => String(x.g.id))))
  const sug = sugerencias()
  document.querySelectorAll('[data-sug]').forEach(b => b.addEventListener('click', () => aceptarSugerencia(sug[+b.dataset.sug])))
  document.querySelectorAll('[data-descartar]').forEach(b => b.addEventListener('click', () => {
    const lista = JSON.parse(localStorage.getItem('fijos-descartados') || '[]')
    lista.push(sug[+b.dataset.descartar].clave)
    localStorage.setItem('fijos-descartados', JSON.stringify(lista))
    render()
  }))
}

// ── Acciones ───────────────────────────────────────────────
async function quitarDuplicados(ids) {
  const filas = gastos.filter(g => ids.includes(String(g.id)))
  const { error } = await dbClient.from('gastos').delete().in('id', filas.map(g => g.id)).eq('usuario_id', window.currentUserId)
  if (error) { aviso('No se pudo quitar: ' + error.message); return }
  gastos = gastos.filter(g => !ids.includes(String(g.id)))
  render()
  aviso(filas.length === 1 ? 'Movimiento quitado' : `${filas.length} movimientos quitados`, async () => {
    await dbClient.from('gastos').insert(filas)
    gastos = gastos.concat(filas).sort((a, b) => b.fecha.localeCompare(a.fecha))
    render()
  })
}

async function aceptarSugerencia(x) {
  const mes = sumarMes(x.ultimoMes, 1)
  const fila = { nombre: x.nombre, categoria: x.categoria, monto: Math.round(x.monto * 100) / 100, dia_del_mes: x.dia, activo: true,
    fecha_inicio: `${mes}-${pad(Math.min(x.dia, diasMes(mes)))}`, fecha_fin: null, usuario_id: window.currentUserId }
  const { data, error } = await dbClient.from('gastos_fijos').insert([fila]).select()
  if (error) { aviso('No se pudo añadir: ' + error.message); return }
  fijos.push(data?.[0] || fila)
  render()
  aviso(`${x.nombre} añadido a tus fijos`)
}

// ── Hoja crear / editar ────────────────────────────────────
const raizHoja = document.getElementById('hoja-raiz'), hoja = raizHoja.querySelector('.hoja')
const $ = id => document.getElementById(id)
let catElegida = null, verTodas = false, tCerrar

function pintarCats() {
  const base = verTodas ? categorias : categorias.slice(0, 7)
  const lista = catElegida && !base.includes(catElegida) ? [catElegida, ...base.slice(0, 6)] : base
  $('h-cats').innerHTML = lista.map(c => `<button type="button" class="cat" data-cat="${esc(c)}" aria-pressed="${c === catElegida}"><span>${esc(emoji(c))}</span><span>${esc(sinEmoji(c))}</span></button>`).join('')
    + (verTodas ? '' : '<button type="button" class="cat" data-mas><span>⋯</span><span>Más</span></button>')
  $('h-cats').querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { catElegida = b.dataset.cat; pintarCats(); validar() }))
  const mas = $('h-cats').querySelector('[data-mas]')
  if (mas) mas.addEventListener('click', () => { verTodas = true; pintarCats() })
}

function validar() {
  const n = parseImporte($('h-monto').value)
  $('h-monto').style.width = Math.max(1, $('h-monto').value.length) + 'ch'
  $('h-guardar').disabled = !(n > 0 && $('h-nombre').value.trim() && catElegida && $('h-desde').value)
  $('h-guardar').textContent = editando ? 'Guardar cambios' : n > 0 ? `Guardar ${fmt(n)} al mes` : 'Guardar'
}

function abrirHoja(f) {
  editando = f || null
  const pre = window.moneda !== '€'
  $('h-mon-pre').textContent = pre ? window.moneda : ''
  $('h-mon-post').textContent = pre ? '' : '€'
  $('h-tit').textContent = f ? 'Editar gasto fijo' : 'Nuevo gasto fijo'
  $('h-monto').value = f ? importeTxt(+f.monto) : ''
  $('h-nombre').value = f ? f.nombre : ''
  $('h-dia').value = f ? (f.dia_del_mes || +String(f.fecha_inicio).slice(8, 10)) : new Date().getDate()
  $('h-desde').value = f ? mesDe(f.fecha_inicio) : mesActual()
  $('h-hasta').value = f && f.fecha_fin ? mesDe(f.fecha_fin) : ''
  $('h-hasta').hidden = !$('h-hasta').value
  $('h-sinfin').hidden = !!$('h-hasta').value
  catElegida = f ? f.categoria : null
  verTodas = false
  $('h-acciones').hidden = !f || (f.fecha_fin && mesDe(f.fecha_fin) < mesActual())
  pintarCats(); validar()
  clearTimeout(tCerrar); hoja.inert = false
  document.documentElement.style.overflow = 'hidden'
  hoja.getBoundingClientRect()  // fija la posición de partida para que la animación se vea
  raizHoja.classList.add('h-abierta')
  if (!f) $('h-monto').focus({ preventScroll: true })
}

function cerrarHoja() {
  raizHoja.classList.remove('h-abierta')
  document.documentElement.style.overflow = ''
  document.activeElement?.blur?.()
  tCerrar = setTimeout(() => { hoja.inert = true }, 280)
}

// nav.js llama a abrirModal() desde el botón + → Gasto fijo
function abrirModal() { abrirHoja(null) }
function editarFijo(id) {
  const f = fijos.find(x => String(x.id) === String(id))
  if (!f) return
  // Uno que ya terminó se reactiva como fijo nuevo desde este mes, para no rellenar los meses sin pagar
  if (f.fecha_fin && mesDe(f.fecha_fin) < mesActual()) {
    abrirHoja({ ...f, id: null, fecha_inicio: mesActual() + '-01', fecha_fin: null })
    editando = null
    $('h-tit').textContent = 'Volver a pagarlo'
    $('h-acciones').hidden = true
    validar()
    return
  }
  abrirHoja(f)
}

async function guardarHoja() {
  const monto = Math.round(parseImporte($('h-monto').value) * 100) / 100
  const desde = $('h-desde').value, hasta = $('h-hasta').value
  const dia = Math.min(31, Math.max(1, parseInt($('h-dia').value, 10) || 1))
  if (hasta && hasta < desde) { aviso('«Hasta» no puede ser antes de «Desde»'); return }
  const datos = {
    nombre: $('h-nombre').value.trim(), categoria: catElegida, monto, dia_del_mes: dia,
    fecha_inicio: `${desde}-${pad(Math.min(dia, diasMes(desde)))}`,
    fecha_fin: hasta ? `${hasta}-${pad(diasMes(hasta))}` : null,
  }
  datos.activo = !datos.fecha_fin || mesDe(datos.fecha_fin) >= mesActual()
  $('h-guardar').disabled = true
  if (editando) {
    const { error } = await dbClient.from('gastos_fijos').update(datos).eq('id', editando.id).eq('usuario_id', window.currentUserId)
    if (error) { validar(); aviso('No se pudo guardar: ' + error.message); return }
    Object.assign(editando, datos)
  } else {
    const { data, error } = await dbClient.from('gastos_fijos').insert([{ ...datos, usuario_id: window.currentUserId }]).select()
    if (error) { validar(); aviso('No se pudo guardar: ' + error.message); return }
    fijos.push(data?.[0] || datos)
  }
  cerrarHoja(); render()
  aviso(editando ? 'Cambios guardados' : `${datos.nombre} añadido`)
}

async function dejarDePagar(cual) {
  const f = editando
  const m = mesActual()
  const fin = cual === 'este' ? fechaLocal() : `${sumarMes(m, -1)}-${pad(diasMes(sumarMes(m, -1)))}`
  const antes = { activo: f.activo, fecha_fin: f.fecha_fin }
  const { error } = await dbClient.from('gastos_fijos').update({ activo: false, fecha_fin: fin }).eq('id', f.id).eq('usuario_id', window.currentUserId)
  if (error) { aviso('No se pudo guardar: ' + error.message); return }
  Object.assign(f, { activo: false, fecha_fin: fin })
  cerrarHoja(); render()
  aviso(cual === 'este' ? `${f.nombre}: este mes es el último` : `${f.nombre} ya no cuenta`, async () => {
    await dbClient.from('gastos_fijos').update(antes).eq('id', f.id).eq('usuario_id', window.currentUserId)
    Object.assign(f, antes); render()
  })
}

async function eliminarDelTodo() {
  const f = editando
  if (!confirm(`¿Eliminar «${f.nombre}» del todo?\n\nDesaparecerá también de los meses pasados y tus estadísticas cambiarán. Si solo has dejado de pagarlo, usa «Este mes es el último».`)) return
  const { error } = await dbClient.from('gastos_fijos').delete().eq('id', f.id).eq('usuario_id', window.currentUserId)
  if (error) { aviso('No se pudo eliminar: ' + error.message); return }
  fijos = fijos.filter(x => x !== f)
  cerrarHoja(); render()
  aviso(`${f.nombre} eliminado`, async () => {
    const { data } = await dbClient.from('gastos_fijos').insert([f]).select()
    fijos.push(data?.[0] || f); render()
  })
}

raizHoja.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrarHoja))
document.addEventListener('keydown', e => { if (e.key === 'Escape' && raizHoja.classList.contains('h-abierta')) cerrarHoja() })
;['h-monto', 'h-nombre', 'h-desde', 'h-dia'].forEach(id => $(id).addEventListener('input', validar))
$('h-monto').addEventListener('input', () => { $('h-monto').value = $('h-monto').value.replace(/[^\d.,]/g, ''); validar() })
$('h-guardar').addEventListener('click', guardarHoja)
$('h-poner-fin').addEventListener('click', () => {
  $('h-sinfin').hidden = true; $('h-hasta').hidden = false
  $('h-hasta').value = $('h-desde').value || mesActual()
  try { $('h-hasta').showPicker() } catch { $('h-hasta').focus() }
})
hoja.querySelectorAll('[data-fin]').forEach(b => b.addEventListener('click', () => dejarDePagar(b.dataset.fin)))
hoja.querySelector('[data-eliminar]').addEventListener('click', eliminarDelTodo)

// ── Aviso con deshacer ─────────────────────────────────────
let tAviso
function aviso(texto, deshacer) {
  const t = $('toast'), b = t.querySelector('button')
  t.querySelector('span').textContent = texto
  b.hidden = !deshacer
  b.onclick = deshacer ? () => { t.classList.remove('ver'); deshacer() } : null
  t.classList.add('ver')
  clearTimeout(tAviso)
  tAviso = setTimeout(() => t.classList.remove('ver'), deshacer ? 5000 : 2500)
}

cargarFijos()
