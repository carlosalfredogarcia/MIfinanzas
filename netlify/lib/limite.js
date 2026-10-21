// netlify/lib/limite.js
// Límite de importación comprobado en el servidor. El navegador solo muestra el resultado:
// el usuario no puede saltárselo cambiando el código de la página.
//   - Primera importación gratis: hasta PRIMERA_MAX movimientos de los últimos 12 meses.
//   - Después: 200 movimientos más (+200 por cada código de desbloqueo).
//   - premium = true: sin límite.
//   - Todos: como máximo MAX_ANALISIS_DIA análisis con IA al día (protege el gasto de la API).

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const LIMITE_BASE      = 200
const POR_CODIGO       = 200
const MAX_ANALISIS_DIA = 20
const PRIMERA_MAX      = 1000
const PRIMERA_INTENTOS = 3   // análisis "primera importación" permitidos sin llegar a guardar

// token = sesión del usuario (lee solo sus filas por RLS); sin token = clave de servicio
function cabeceras(token, extra = {}) {
  const key = token ? SUPABASE_KEY : SERVICE_KEY
  return { apikey: key, authorization: `Bearer ${token || SERVICE_KEY}`, ...extra }
}

async function obtenerUsuario(token) {
  if (!token) return null
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY } })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.id ? data : null
  } catch {
    return null
  }
}

function parseCodigos(val) {
  if (!val) return []
  if (Array.isArray(val)) return val.filter(Boolean)
  const s = String(val).trim()
  if (s.startsWith('[')) { try { return JSON.parse(s).filter(Boolean) } catch { /* sigue */ } }
  if (s.startsWith('{')) return s.slice(1, -1).split(',').map(c => c.replace(/"/g, '').trim()).filter(Boolean)
  return s.split(',').map(c => c.trim()).filter(Boolean)
}

async function leerPerfil(uid, token) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/perfil?usuario_id=eq.${uid}&select=*&limit=1`, { headers: cabeceras(token) })
  if (!resp.ok) throw new Error('No se pudo leer el perfil')
  return (await resp.json())[0] || null
}

async function contar(tabla, filtro, token) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}?${filtro}&select=id`, {
    method: 'HEAD', headers: cabeceras(token, { prefer: 'count=exact', range: '0-0' })
  })
  if (!resp.ok) throw new Error(`No se pudo contar ${tabla}`)
  return parseInt((resp.headers.get('content-range') || '').split('/')[1], 10) || 0
}

// Primeras importaciones registradas (filas analizadas en cada una)
async function primerasImportaciones(uid) {
  if (!SERVICE_KEY) return []
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/import_uso?usuario_id=eq.${uid}&primera=eq.true&select=filas`, { headers: cabeceras(null) })
    const filas = resp.ok ? await resp.json() : []
    return Array.isArray(filas) ? filas.map(r => r.filas || 0) : []
  } catch { return [] }
}

// Estado del usuario: cuántos lleva importados, su límite y cuántos puede importar ahora (cupo)
async function estadoLimite(uid, token) {
  const perfil = await leerPerfil(uid, token)
  const premium = perfil?.premium === true
  const codigos = parseCodigos(perfil?.codigos_usados)
  const filtro = `usuario_id=eq.${uid}&origen=eq.importado`
  const [g, i, primeras] = await Promise.all([contar('gastos', filtro, token), contar('ingresos', filtro, token), primerasImportaciones(uid)])
  const usados = g + i
  // Lo traído en la primera importación no gasta los 200 gratis
  const bono = Math.min(PRIMERA_MAX, Math.max(0, ...primeras))
  const limite = (perfil?.limite_importacion ?? LIMITE_BASE) + codigos.length * POR_CODIGO + bono
  const primera = !premium && usados === 0 && primeras.length < PRIMERA_INTENTOS
  const cupo = premium ? Infinity : primera ? PRIMERA_MAX : Math.max(0, limite - usados)
  return { premium, limite, usados, perfil, codigos, primera, cupo }
}

// Análisis con IA de hoy (tabla import_uso, solo accesible con la clave de servicio)
async function analisisHoy(uid) {
  if (!SERVICE_KEY) return 0
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  return contar('import_uso', `usuario_id=eq.${uid}&creado=gte.${encodeURIComponent(desde)}`)
}

// Se registra antes de llamar a la IA (cuenta para el máximo diario aunque falle) y devuelve el id
async function registrarAnalisis(uid, datos) {
  if (!SERVICE_KEY) { console.warn('SUPABASE_SERVICE_ROLE_KEY sin configurar: no se registra el análisis'); return null }
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/import_uso?select=id`, {
      method: 'POST', headers: cabeceras(null, { 'content-type': 'application/json', prefer: 'return=representation' }),
      body: JSON.stringify({ usuario_id: uid, ...datos })
    })
    return resp.ok ? (await resp.json())[0]?.id ?? null : null
  } catch (e) { console.warn('import_uso:', e.message); return null }
}

// Al terminar: filas reales enviadas, tokens y coste
async function actualizarAnalisis(id, datos) {
  if (!SERVICE_KEY || !id) return
  await fetch(`${SUPABASE_URL}/rest/v1/import_uso?id=eq.${id}`, {
    method: 'PATCH', headers: cabeceras(null, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(datos)
  }).catch(e => console.warn('import_uso:', e.message))
}

module.exports = {
  SUPABASE_URL, SUPABASE_KEY, SERVICE_KEY, LIMITE_BASE, POR_CODIGO, MAX_ANALISIS_DIA, PRIMERA_MAX,
  cabeceras, obtenerUsuario, parseCodigos, leerPerfil, estadoLimite, analisisHoy, registrarAnalisis, actualizarAnalisis,
}
