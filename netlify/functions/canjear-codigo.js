// netlify/functions/canjear-codigo.js
// Canjea un código de desbloqueo (+200 movimientos importados).
// Los códigos válidos viven en la variable de entorno CODIGOS_DESBLOQUEO de Netlify
// (separados por comas), nunca en la página. Solo este servidor puede escribir
// codigos_usados en perfil: la base de datos lo bloquea para los usuarios.

const { SUPABASE_URL, SERVICE_KEY, POR_CODIGO, cabeceras, obtenerUsuario, parseCodigos, estadoLimite } = require('../lib/limite')

const NO_CACHE = { 'content-type': 'application/json', 'cache-control': 'no-store, no-cache' }
const responder = (statusCode, datos) => ({ statusCode, headers: NO_CACHE, body: JSON.stringify(datos) })

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return responder(405, { error: 'Método no permitido' })

  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  const usuario = await obtenerUsuario(token)
  if (!usuario) return responder(401, { error: 'No autorizado' })

  const validos = parseCodigos(process.env.CODIGOS_DESBLOQUEO).map(c => c.toUpperCase())
  if (!SERVICE_KEY || !validos.length) return responder(503, { error: 'Los códigos no están disponibles ahora mismo' })

  let codigo = ''
  try { codigo = String(JSON.parse(event.body || '{}').codigo || '').trim().toUpperCase() } catch { /* vacío */ }
  if (!validos.includes(codigo)) return responder(400, { error: 'Código no válido' })

  let estado
  try { estado = await estadoLimite(usuario.id, token) } catch { return responder(503, { error: 'No se pudo comprobar tu perfil' }) }
  if (estado.codigos.map(c => c.toUpperCase()).includes(codigo)) return responder(409, { error: 'Este código ya fue utilizado' })

  // Mismo formato que ya tenga la columna (texto separado por comas o lista)
  const anterior = estado.perfil?.codigos_usados
  const lista = [...estado.codigos, codigo]
  const valor = Array.isArray(anterior) ? lista : lista.join(',')
  const url = estado.perfil
    ? `${SUPABASE_URL}/rest/v1/perfil?usuario_id=eq.${usuario.id}`
    : `${SUPABASE_URL}/rest/v1/perfil`
  const resp = await fetch(url, {
    method: estado.perfil ? 'PATCH' : 'POST',
    headers: cabeceras(null, { 'content-type': 'application/json', prefer: 'return=minimal' }),
    body: JSON.stringify(estado.perfil ? { codigos_usados: valor } : { usuario_id: usuario.id, codigos_usados: valor }),
  })
  if (!resp.ok) return responder(500, { error: 'No se pudo guardar el código' })

  return responder(200, { ok: true, usados: estado.usados, max: estado.limite + POR_CODIGO })
}
