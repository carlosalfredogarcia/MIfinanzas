// netlify/lib/limite.js
// Límite de importación comprobado en el servidor. El navegador solo muestra el resultado:
// el usuario no puede saltárselo cambiando el código de la página.
//   - Gratis: 200 movimientos importados (+200 por cada código de desbloqueo).
//   - premium = true: sin límite.
//   - Todos: como máximo MAX_ANALISIS_DIA análisis con IA al día (protege el gasto de la API).

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const LIMITE_BASE      = 200
const POR_CODIGO       = 200
const MAX_ANALISIS_DIA = 20

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

// Estado del usuario: cuántos lleva importados y cuál es su límite
async function estadoLimite(uid, token) {
  const perfil = await leerPerfil(uid, token)
  const premium = perfil?.premium === true
  const codigos = parseCodigos(perfil?.codigos_usados)
  const limite = (perfil?.limite_importacion ?? LIMITE_BASE) + codigos.length * POR_CODIGO
  const filtro = `usuario_id=eq.${uid}&origen=eq.importado`
  const [g, i] = await Promise.all([contar('gastos', filtro, token), contar('ingresos', filtro, token)])
  return { premium, limite, usados: g + i, perfil, codigos }
}

// Análisis con IA de hoy (tabla import_uso, solo accesible con la clave de servicio)
async function analisisHoy(uid) {
  if (!SERVICE_KEY) return 0
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  return contar('import_uso', `usuario_id=eq.${uid}&creado=gte.${encodeURIComponent(desde)}`)
}

async function registrarAnalisis(uid, filas) {
  if (!SERVICE_KEY) { console.warn('SUPABASE_SERVICE_ROLE_KEY sin configurar: no se registra el análisis'); return }
  await fetch(`${SUPABASE_URL}/rest/v1/import_uso`, {
    method: 'POST', headers: cabeceras(null, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify({ usuario_id: uid, filas })
  }).catch(e => console.warn('import_uso:', e.message))
}

module.exports = {
  SUPABASE_URL, SUPABASE_KEY, SERVICE_KEY, LIMITE_BASE, POR_CODIGO, MAX_ANALISIS_DIA,
  cabeceras, obtenerUsuario, parseCodigos, leerPerfil, estadoLimite, analisisHoy, registrarAnalisis,
}
