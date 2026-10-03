// netlify/functions/import-csv.js
// Recibe el contenido de un extracto bancario CSV y usa Claude para extraer
// todos los gastos (débitos/pagos). Devuelve { gastos: [{ descripcion, categoria, monto, fecha }] }.

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

  const csv = String(body.csv || '').trim()
  if (!csv) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el contenido del CSV' }) }
  }

  const categorias = Array.isArray(body.categorias) && body.categorias.length
    ? body.categorias
    : CATS_DEFAULT

  // Limitar a las primeras 200 líneas para no exceder el contexto de Claude
  const lineas = csv.split('\n')
  const csvFinal = lineas.slice(0, 200).join('\n')
  const truncado = lineas.length > 200

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }) }
  }

  const hoy = new Date().toISOString().slice(0, 10)

  const tool = {
    name: 'registrar_gastos',
    description: 'Extrae todos los gastos/débitos del extracto bancario CSV. Solo incluye salidas de dinero: compras, pagos, débitos, cargos. Ignora ingresos, abonos y transferencias recibidas.',
    input_schema: {
      type: 'object',
      properties: {
        gastos: {
          type: 'array',
          description: 'Un elemento por cada gasto o débito encontrado en el extracto.',
          items: {
            type: 'object',
            properties: {
              descripcion: { type: 'string', description: 'Descripción limpia del gasto tal como aparece en el extracto' },
              categoria: { type: 'string', enum: categorias, description: 'La categoría de la lista que mejor encaje. Si ninguna encaja, usa "📦 Otros".' },
              monto: { type: 'number', description: 'Monto siempre positivo, solo el número sin símbolo de moneda' },
              fecha: { type: 'string', description: `Fecha en formato YYYY-MM-DD. Si el año no aparece, asume ${hoy.slice(0, 4)}.` }
            },
            required: ['descripcion', 'categoria', 'monto', 'fecha']
          }
        }
      },
      required: ['gastos']
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
        max_tokens: 8192,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'registrar_gastos' },
        messages: [{
          role: 'user',
          content: `Extrae todos los gastos (débitos, pagos, compras) del siguiente extracto bancario en CSV${truncado ? ' (truncado a las primeras 200 líneas)' : ''}.\n\nCategorías disponibles: ${categorias.join(', ')}\nFecha de hoy: ${hoy}\n\nEXTRACTO:\n${csvFinal}`
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
    return { statusCode: 502, body: JSON.stringify({ error: 'Claude no pudo interpretar el extracto' }) }
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(toolUse.input)
  }
}
