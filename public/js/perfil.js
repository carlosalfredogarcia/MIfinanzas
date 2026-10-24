// mifinanza-perfil.html — se carga al final de la página, después de auth.js
const WHATSAPP = '34640309239'
const CATS_DEFAULT = MF.CATS_DEFAULT
// Se guarda el símbolo, que es lo que usan las demás pantallas para mostrar los importes
const MONEDAS = [['€', 'Euro'], ['$', 'Dólar / Peso'], ['Bs', 'Bolívar'], ['S/', 'Sol'], ['R$', 'Real'], ['£', 'Libra']]
const EMOJIS = ['🏷️', '🍔', '☕', '🍺', '🛒', '🐶', '👶', '🎁', '✈️', '🚌', '🚕', '💊', '💇', '🎮', '📚', '🎓', '🧹', '🔧', '🛋️', '💍', '⚽', '🎬', '🎵', '🏦', '💼', '🏠', '💡', '📱', '🚗', '❤️', '👕', '📦']
// Tablas donde se guarda el nombre de la categoría (para renombrar o juntar sin perder nada)
// [tabla, columna de la categoría, columna del usuario]
const TABLAS_CAT = [['gastos', 'categoria', 'usuario_id'], ['gastos_fijos', 'categoria', 'usuario_id'], ['ingresos', 'tipo', 'usuario_id'], ['user_gasto_plan', 'categoria', 'user_id'], ['categoria_tipo', 'categoria', 'user_id']]

let perfil = null, uid = null, correo = '', categorias = [], usos = {}
let verTodas = false

const $ = id => document.getElementById(id)
const { esc, sinEmoji } = MF
const emoji = c => MF.emoji(c, '🏷️')
const mismaCat = (a, b) => sinEmoji(a).toLowerCase() === sinEmoji(b).toLowerCase()

// ── Carga ──────────────────────────────────────────────────
async function cargarPerfil() {
  const { data: { session } } = await dbClient.auth.getSession()
  uid = session?.user?.id
  correo = session?.user?.email || ''
  if (!uid) return
  // El color de acento ya no se elige: cada pantalla usa su propio diseño
  localStorage.removeItem('color')
  const { data: filas } = await dbClient.from('perfil').select('*').eq('usuario_id', uid).limit(1)
  perfil = filas?.[0] || null
  if (!perfil) {
    const { data } = await dbClient.from('perfil').insert({ usuario_id: uid, nombre: '', moneda: localStorage.getItem('moneda') || '€', categorias: CATS_DEFAULT }).select()
    perfil = data?.[0] || { usuario_id: uid, nombre: '', moneda: '€', categorias: CATS_DEFAULT }
  }
  categorias = [...new Set((perfil.categorias || CATS_DEFAULT).split(',').map(c => c.trim()).filter(Boolean))]
  pintarCabecera(); pintarMonedas(); pintarCats(); prepararWhatsApp()
  $('inp-nombre').value = perfil.nombre || ''
  cargarUsos(); cargarPlan()
}

function pintarCabecera() {
  const n = (perfil.nombre || '').trim()
  $('hero-nombre').textContent = n || 'Tu perfil'
  $('hero-correo').textContent = correo
  $('avatar').textContent = (n || correo || '?').charAt(0).toUpperCase()
}

// ── Nombre y moneda (se guardan solos) ─────────────────────
async function guardarPerfil(cambios, msg) {
  const { error } = await dbClient.from('perfil').update(cambios).eq('usuario_id', uid)
  if (error) { aviso('No se pudo guardar: ' + error.message); return false }
  Object.assign(perfil, cambios)
  const g = $('guardado'); g.textContent = '✓ ' + msg; g.style.opacity = 1
  clearTimeout(g._t); g._t = setTimeout(() => { g.style.opacity = 0 }, 1800)
  return true
}

let tNombre
$('inp-nombre').addEventListener('input', () => {
  clearTimeout(tNombre)
  tNombre = setTimeout(async () => {
    if (await guardarPerfil({ nombre: $('inp-nombre').value.trim() }, 'Nombre guardado')) pintarCabecera()
  }, 600)
})

function pintarMonedas() {
  const actual = { USD: '$', EUR: '€', VES: 'Bs' }[perfil.moneda] || perfil.moneda || '€'
  $('monedas').innerHTML = MONEDAS.map(([s, n]) => `<button type="button" class="chip" data-mon="${esc(s)}" aria-pressed="${s === actual}">${esc(s)} · ${n}</button>`).join('')
  $('monedas').querySelectorAll('[data-mon]').forEach(b => b.addEventListener('click', async () => {
    const s = b.dataset.mon
    if (await guardarPerfil({ moneda: s }, 'Moneda guardada')) {
      localStorage.setItem('moneda', s); window.moneda = s
      pintarMonedas(); cargarPlan()
    }
  }))
}

// ── Plan e importación ─────────────────────────────────────
async function cargarPlan() {
  if (perfil.premium === true) {
    $('plan-nombre').textContent = 'Premium'
    $('plan-etq').textContent = 'Premium'; $('plan-etq').classList.add('premium')
    $('plan-txt').textContent = 'Tienes la importación de extractos sin límite. ¡Gracias por apoyar MiFinanzas!'
    $('plan-uso').hidden = true
    return
  }
  const filtro = q => q.eq('usuario_id', uid).eq('origen', 'importado')
  const [g, i] = await Promise.all([
    filtro(dbClient.from('gastos').select('*', { count: 'exact', head: true })),
    filtro(dbClient.from('ingresos').select('*', { count: 'exact', head: true })),
  ])
  const usados = (g.count || 0) + (i.count || 0)
  const codigos = String(perfil.codigos_usados || '').split(',').filter(Boolean).length
  const limite = (perfil.limite_importacion ?? 200) + codigos * 200
  $('plan-cifra').textContent = `${usados.toLocaleString('es-ES')} de ${limite.toLocaleString('es-ES')}`
  $('plan-barra').style.width = Math.min(100, usados / limite * 100) + '%'
  if (usados >= limite) $('plan-txt').textContent = 'Has usado todos los movimientos importados gratis. Puedes seguir apuntando a mano sin límite, o escríbenos para ampliar la importación.'
}

// ── Categorías ─────────────────────────────────────────────
async function cargarUsos() {
  const res = await Promise.all([
    dbClient.from('gastos').select('categoria').eq('usuario_id', uid),
    dbClient.from('gastos_fijos').select('categoria').eq('usuario_id', uid),
    dbClient.from('ingresos').select('tipo').eq('usuario_id', uid),
  ])
  usos = {}
  for (const r of res) for (const f of r.data || []) { const c = f.categoria || f.tipo; if (c) usos[c] = (usos[c] || 0) + 1 }
  pintarCats()
}

function pintarCats() {
  const orden = [...categorias].sort((a, b) => (usos[b] || 0) - (usos[a] || 0) || sinEmoji(a).localeCompare(sinEmoji(b), 'es'))
  const lista = verTodas ? orden : orden.slice(0, 8)
  $('cats').innerHTML = lista.map(c => {
    const n = usos[c] || 0
    return `<div class="cat-fila"><span class="cat-e">${esc(emoji(c))}</span>
      <span class="cat-n">${esc(sinEmoji(c))}<small>${n ? `${n.toLocaleString('es-ES')} movimiento${n === 1 ? '' : 's'}` : 'Sin movimientos'}</small></span>
      <button type="button" class="cat-btn" data-cat="${esc(c)}" aria-label="Opciones de ${esc(sinEmoji(c))}">⋯</button></div>`
  }).join('') + (orden.length > 8 ? `<button type="button" class="ver-mas" id="ver-mas">${verTodas ? 'Ver menos' : `Ver las ${orden.length}`}</button>` : '')
  // Categorías con movimientos que no están en la lista (p. ej. puestas al importar): no salen al apuntar
  const fuera = Object.keys(usos).filter(c => !categorias.includes(c)).sort((a, b) => usos[b] - usos[a])
  $('cats-fuera').hidden = !fuera.length
  $('cats-fuera').innerHTML = fuera.length ? `<p class="h-txt" style="margin:0 4px 8px">Tienes movimientos en estas categorías, pero no están en tu lista y no salen al apuntar:</p>
    <div class="chips">${fuera.map(c => `<button type="button" class="chip" data-anadir="${esc(c)}">＋ ${esc(c)} <span style="color:var(--muted)">${usos[c]}</span></button>`).join('')}</div>` : ''
  $('cats-fuera').querySelectorAll('[data-anadir]').forEach(b => b.addEventListener('click', async () => {
    if (await guardarLista([...categorias, b.dataset.anadir])) aviso(`${b.dataset.anadir} añadida`)
  }))
  $('cats').querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => opcionesCat(b.dataset.cat)))
  const vm = $('ver-mas'); if (vm) vm.addEventListener('click', () => { verTodas = !verTodas; pintarCats() })
}

async function guardarLista(nueva) {
  const { error } = await dbClient.from('perfil').update({ categorias: nueva.join(',') }).eq('usuario_id', uid)
  if (error) { aviso('No se pudo guardar: ' + error.message); return false }
  categorias = nueva; perfil.categorias = nueva.join(',')
  pintarCats()
  return true
}

// Formulario de emoji + nombre, para crear o renombrar
function formCategoria({ titulo, inicial, boton, alGuardar }) {
  let elegido = inicial ? emoji(inicial) : EMOJIS[0]
  abrirHoja(titulo, `
    <div class="h-campo"><span class="lbl">Emoji</span><div class="emojis" id="f-emojis"></div></div>
    <div class="h-campo"><label class="lbl" for="f-nombre">Nombre</label><input class="inp" id="f-nombre" maxlength="30" placeholder="Ej: Mascotas" value="${esc(inicial ? sinEmoji(inicial) : '')}"></div>
    <button type="button" class="btn-grande" id="f-ok">${boton}</button>`)
  const lista = EMOJIS.includes(elegido) ? EMOJIS : [elegido, ...EMOJIS.slice(0, -1)]
  $('f-emojis').innerHTML = lista.map(e => `<button type="button" aria-pressed="${e === elegido}" aria-label="${e}">${e}</button>`).join('')
  $('f-emojis').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    elegido = b.textContent
    $('f-emojis').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
  }))
  const ok = async () => {
    const n = $('f-nombre').value.trim().replace(/,/g, ' ')
    if (!n) { $('f-nombre').focus(); return }
    $('f-ok').disabled = true
    await alGuardar(`${elegido} ${n.charAt(0).toUpperCase()}${n.slice(1)}`)
    $('f-ok') && ($('f-ok').disabled = false)
  }
  $('f-ok').addEventListener('click', ok)
  $('f-nombre').addEventListener('keydown', e => { if (e.key === 'Enter') ok() })
  if (!inicial) $('f-nombre').focus()
}

$('btn-nueva-cat').addEventListener('click', () => formCategoria({
  titulo: 'Nueva categoría', boton: 'Crear categoría',
  alGuardar: async cat => {
    if (categorias.some(c => mismaCat(c, cat))) { aviso('Ya tienes esa categoría'); return }
    if (await guardarLista([...categorias, cat])) { cerrarHoja(); aviso(`${cat} creada`) }
  },
}))

function opcionesCat(cat) {
  const n = usos[cat] || 0
  abrirHoja(`${emoji(cat)} ${sinEmoji(cat)}`, `
    <p class="h-txt">${n ? `Tiene ${n.toLocaleString('es-ES')} movimiento${n === 1 ? '' : 's'}.` : 'Aún no tiene movimientos.'}</p>
    <div class="h-opc">
      <button type="button" id="o-renombrar">Renombrar o cambiar emoji<small>También cambia en tus movimientos, fijos y plan</small></button>
      <button type="button" id="o-juntar">Juntar con otra categoría<small>Sus movimientos pasan a la otra y esta desaparece</small></button>
      <button type="button" id="o-quitar">Quitar de la lista<small>Deja de salir al apuntar un gasto. Tus movimientos no se borran</small></button>
    </div>`)
  $('o-renombrar').addEventListener('click', () => formCategoria({
    titulo: 'Renombrar categoría', inicial: cat, boton: 'Guardar',
    alGuardar: async nueva => {
      if (nueva === cat) { cerrarHoja(); return }
      if (categorias.some(c => c !== cat && mismaCat(c, nueva))) { aviso('Ya existe; usa «Juntar con otra»'); return }
      if (await moverCategoria(cat, nueva)) { cerrarHoja(); aviso(`Ahora se llama ${nueva}`) }
    },
  }))
  $('o-juntar').addEventListener('click', () => {
    const otras = categorias.filter(c => c !== cat)
    abrirHoja(`Juntar ${sinEmoji(cat)} con…`, `<p class="h-txt">Elige la categoría que se queda. Los movimientos de «${esc(sinEmoji(cat))}» pasarán a ella.</p>
      <div class="h-opc">${otras.map((c, i) => `<button type="button" data-i="${i}">${esc(c)}<small>${(usos[c] || 0).toLocaleString('es-ES')} movimientos</small></button>`).join('')}</div>`)
    document.querySelectorAll('#h-cuerpo [data-i]').forEach(b => b.addEventListener('click', async () => {
      const destino = otras[+b.dataset.i]
      if (!confirm(`¿Pasar todo lo de «${sinEmoji(cat)}» a «${sinEmoji(destino)}»?`)) return
      if (await moverCategoria(cat, destino)) { cerrarHoja(); aviso(`${sinEmoji(cat)} se juntó con ${sinEmoji(destino)}`) }
    }))
  })
  $('o-quitar').addEventListener('click', async () => {
    const antes = [...categorias]
    if (await guardarLista(categorias.filter(c => c !== cat))) {
      cerrarHoja()
      aviso(`${sinEmoji(cat)} quitada`, () => guardarLista(antes))
    }
  })
}

// Cambia el nombre en todas las tablas; si el destino ya existe, es «juntar»
async function moverCategoria(desde, hasta) {
  for (const [tabla, col, usr] of TABLAS_CAT) {
    const { error } = await dbClient.from(tabla).update({ [col]: hasta }).eq(usr, uid).eq(col, desde)
    // En el plan y en los tipos solo puede haber una fila por categoría: si ya existe la de destino, sobra la vieja
    if (error && (tabla === 'user_gasto_plan' || tabla === 'categoria_tipo')) await dbClient.from(tabla).delete().eq(usr, uid).eq(col, desde)
    else if (error) { aviso('No se pudo cambiar: ' + error.message); return false }
  }
  const lista = categorias.includes(hasta) ? categorias.filter(c => c !== desde) : categorias.map(c => c === desde ? hasta : c)
  usos[hasta] = (usos[hasta] || 0) + (usos[desde] || 0); delete usos[desde]
  return guardarLista(lista)
}

// ── Soporte ────────────────────────────────────────────────
function prepararWhatsApp() {
  const ua = navigator.userAgent
  const movil = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : 'Ordenador'
  const instalada = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches ? 'app instalada' : 'navegador'
  const texto = `Hola, te escribo desde MiFinanzas.\n\n(Cuéntanos aquí qué pasó o qué idea tienes)\n\n—\nCuenta: ${correo}\nDispositivo: ${movil} · ${instalada}`
  $('btn-wa').href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`
}

// ── Cuenta ─────────────────────────────────────────────────
$('btn-clave').addEventListener('click', async () => {
  const { error } = await dbClient.auth.resetPasswordForEmail(correo, { redirectTo: location.origin + '/index.html' })
  aviso(error ? 'No se pudo enviar: ' + error.message : 'Te enviamos un enlace a ' + correo)
})
$('btn-salir').addEventListener('click', async () => { await dbClient.auth.signOut(); location.replace('index.html') })
$('btn-borrar-movs').addEventListener('click', () => {
  abrirHoja('Borrar todos mis movimientos', `
    <p class="h-txt">Se eliminarán todos tus gastos, ingresos y gastos fijos. Esta acción no se puede deshacer.</p>
    <p class="h-txt">Escribe <strong>CONFIRMAR</strong> para continuar.</p>
    <input type="text" id="borrar-movs-input" placeholder="CONFIRMAR" autocomplete="off" style="display:block;width:100%;box-sizing:border-box;margin-bottom:12px;background:#111827;border:1px solid #1f2937;border-radius:10px;padding:10px 12px;color:#f1f5f9;font-size:15px;font-family:Manrope,sans-serif;outline:none">
    <button id="borrar-movs-btn" class="btn-grande rojo" style="opacity:0.4;pointer-events:none" onclick="ejecutarBorrarMovs()">🗑 Eliminar todos los movimientos</button>`)
  setTimeout(() => {
    const inp = document.getElementById('borrar-movs-input')
    const btn = document.getElementById('borrar-movs-btn')
    if (inp && btn) inp.addEventListener('input', () => {
      const ok = inp.value === 'CONFIRMAR'
      btn.style.opacity = ok ? '1' : '0.4'
      btn.style.pointerEvents = ok ? 'auto' : 'none'
    })
  }, 100)
})
window.ejecutarBorrarMovs = async function() {
  const inp = document.getElementById('borrar-movs-input')
  if (!inp || inp.value !== 'CONFIRMAR') return
  cerrarHoja()
  const uid = window.currentUserId
  if (!uid) { aviso('No se pudo identificar el usuario'); return }
  aviso('Eliminando movimientos…')
  try {
    const [r1, r2, r3] = await Promise.all([
      dbClient.from('gastos').delete().eq('usuario_id', uid),
      dbClient.from('ingresos').delete().eq('usuario_id', uid),
      dbClient.from('gastos_fijos').delete().eq('usuario_id', uid)
    ])
    if (r1.error || r2.error || r3.error) throw new Error('Error en Supabase')
    aviso('✅ Todos los movimientos eliminados')
  } catch (e) {
    aviso('❌ Error al eliminar: ' + e.message)
  }
}
$('btn-borrar').addEventListener('click', () => {
  const texto = `Hola, quiero borrar mi cuenta de MiFinanzas y todos mis datos.\n\nCuenta: ${correo}`
  abrirHoja('Borrar mi cuenta', `
    <p class="h-txt">Se borrarán tu cuenta y todos tus datos: movimientos, gastos fijos, metas y préstamos. No se puede deshacer.</p>
    <p class="h-txt">Antes, si quieres, <a href="mifinanza-movimientos.html#descargar" style="color:var(--indigo-txt);font-weight:700">descarga tus movimientos</a>.</p>
    <p class="h-txt">Para confirmar que eres tú, la petición se hace por WhatsApp y la completamos en un máximo de 30 días.</p>
    <a class="btn-grande rojo" style="display:block;text-align:center;text-decoration:none" target="_blank" rel="noopener noreferrer" href="https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}">Pedir el borrado por WhatsApp</a>`)
})

// ── Hoja ───────────────────────────────────────────────────
const raizHoja = $('hoja-raiz'), hoja = raizHoja.querySelector('.hoja')
let tCerrar
function abrirHoja(titulo, html) {
  $('h-tit').textContent = titulo
  $('h-cuerpo').innerHTML = html
  clearTimeout(tCerrar); hoja.inert = false
  document.documentElement.style.overflow = 'hidden'
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

cargarPerfil()
