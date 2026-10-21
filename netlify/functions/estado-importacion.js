// netlify/functions/estado-importacion.js
// Lo que el usuario puede importar ahora, para el contador de la ventana de importación.
// Mismo cálculo que import-csv.js (netlify/lib/limite.js).

const { obtenerUsuario, estadoLimite, PRIMERA_MAX } = require('../lib/limite')

const NO_CACHE = { 'content-type': 'application/json', 'cache-control': 'no-store, no-cache' }

exports.handler = async (event) => {
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  const usuario = await obtenerUsuario(token)
  if (!usuario) return { statusCode: 401, headers: NO_CACHE, body: JSON.stringify({ error: 'No autorizado' }) }
  try {
    const e = await estadoLimite(usuario.id, token)
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ premium: e.premium, primera: e.primera, primeraMax: PRIMERA_MAX, usados: e.usados, limite: e.limite, cupo: e.premium ? null : e.cupo }) }
  } catch {
    return { statusCode: 503, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudo leer tu límite' }) }
  }
}
