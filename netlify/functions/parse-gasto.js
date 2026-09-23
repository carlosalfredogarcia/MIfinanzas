// netlify/functions/parse-gasto.js
// Recibe una transcripción de voz + las categorías del usuario, y usa Claude
// (server-side, con la API key nunca expuesta al cliente) para devolver
// un gasto estructurado: { descripcion, categoria, monto, fecha }.

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

const CATS_DEFAULT = [
  '🍔 Comida', '🏠 Alquiler', '💳 Crédito', '📱 Línea', '🏋️ Gym', '⛽ Gasolina',
  '💻 Tecnología', '❤️ Salud', '👕 Ropa', '🎉 Salidas', '🌍 Remesas',
  '⚠️ Gastos Imprevistos', '📋 Trámite', '🚗 Vehículo', '📦 Otros'
]

async function usuarioValido(token) {
  if (!token) return false
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY }
    })
    return resp.ok
  } catch {
    return false
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!(await usuarioValido(token))) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  const texto = String(body.texto || '').trim()
  if (!texto) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el texto de la transcripción' }) }
  }
  const categorias = Array.isArray(body.categorias) && body.categorias.length
    ? body.categorias
    : CATS_DEFAULT

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }) }
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const tool = {
    name: 'registrar_gasto',
    description: 'Extrae los datos estructurados de un gasto a partir de una frase hablada por el usuario.',
    input_schema: {
      type: 'object',
      properties: {
        descripcion: { type: 'string', description: 'Descripción breve del gasto, ej: "Almuerzo", "Gasolina"' },
        categoria: { type: 'string', enum: categorias, description: 'La categoría de la lista que mejor encaje. Si ninguna encaja, usa "📦 Otros".' },
        monto: { type: 'number', description: 'Monto del gasto, solo el número, sin símbolos' },
        fecha: { type: 'string', description: `Fecha en formato YYYY-MM-DD. Si no se menciona, usa ${hoy}. Si dice "ayer", "antier", etc., calcúlala en relación a ${hoy}.` }
      },
      required: ['descripcion', 'categoria', 'monto', 'fecha']
    }
  }

  let resp
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'registrar_gasto' },
        messages: [{
          role: 'user',
          content: `Transcripción de voz del usuario: "${texto}"\n\nCategorías disponibles: ${categorias.join(', ')}\n\nExtrae los datos del gasto con la herramienta registrar_gasto.`
        }]
      })
    })
  } catch (err) {
    return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo contactar a Anthropic', detalle: String(err) }) }
  }

  if (!resp.ok) {
    const errText = await resp.text()
    return { statusCode: 502, body: JSON.stringify({ error: 'Error de la API de Anthropic', detalle: errText }) }
  }

  const data = await resp.json()
  const toolUse = (data.content || []).find(b => b.type === 'tool_use')
  if (!toolUse) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Claude no devolvió datos estructurados' }) }
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toolUse.input)
  }
}
