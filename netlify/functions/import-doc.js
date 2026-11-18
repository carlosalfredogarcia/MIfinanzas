// netlify/functions/import-doc.js — extractos en PDF y capturas o fotos con varios gastos.
// El móvil manda una pieza cada vez (el texto de unas líneas de un PDF, o una imagen ya reducida)
// y varias en paralelo, para no pasar del tiempo máximo de una función de Netlify.
// Claude devuelve cada movimiento con fecha, concepto corto, categoría, importe y si es gasto o ingreso.
// Modelo: IMPORT_MODEL en las variables de Netlify (por defecto el mismo que import-csv.js).

const { CATS_DEFAULT, NO_CACHE, obtenerUsuario } = require('../lib/comun')

const MODELO = process.env.IMPORT_MODEL || 'claude-haiku-4-5'
const MAX_TEXTO = 20000                 // caracteres por pieza de texto
const MAX_IMAGEN = 4.5 * 1024 * 1024    // base64 de una imagen
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp']

const fechaOk = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T00:00:00'))

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: NO_CACHE, body: JSON.stringify({ error: 'Método no permitido' }) }
  }
  const token = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
  if (!(await obtenerUsuario(token))) {
    return { statusCode: 401, headers: NO_CACHE, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  let body
  try { body = JSON.parse(event.body || '{}') } catch {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'JSON inválido' }) }
  }
  const texto = typeof body.texto === 'string' ? body.texto.trim() : ''
  const imagen = body.imagen && typeof body.imagen.data === 'string' ? body.imagen : null
  if (!texto && !imagen) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Falta el texto o la imagen' }) }
  }
  if (texto.length > MAX_TEXTO) {
    return { statusCode: 413, headers: NO_CACHE, body: JSON.stringify({ error: 'Trozo de texto demasiado largo' }) }
  }
  if (imagen && (!TIPOS_IMAGEN.includes(imagen.media_type) || imagen.data.length > MAX_IMAGEN)) {
    return { statusCode: 413, headers: NO_CACHE, body: JSON.stringify({ error: 'Imagen no válida o demasiado grande' }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers: NO_CACHE, body: JSON.stringify({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }) }
  }

  const categorias = Array.isArray(body.categorias) && body.categorias.length ? body.categorias.map(String) : CATS_DEFAULT
  const hoy = new Date().toISOString().slice(0, 10)

  const herramienta = {
    name: 'registrar_movimientos',
    description: 'Registra todos los movimientos de dinero que aparecen en el extracto o la captura.',
    input_schema: {
      type: 'object',
      properties: {
        movimientos: {
          type: 'array',
          description: 'Un elemento por cada movimiento, en el orden en que aparecen. Vacío si no hay ninguno.',
          items: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'AAAA-MM-DD. Si la fecha no trae año, el de hoy (o el anterior si quedaría en el futuro).' },
              descripcion: { type: 'string', description: 'Comercio o concepto en 1-3 palabras: "COMPRA TARJ. MERCADONA 1234 FUENGIROLA" → "Mercadona".' },
              categoria: { type: 'string', enum: categorias, description: 'Sin categoría clara → 📦 Otros. Nóminas y salarios → 💼 Nómina.' },
              monto: { type: 'number', description: 'Importe en positivo, con decimales.' },
              tipo: { type: 'string', enum: ['gasto', 'ingreso'], description: 'Cargo, pago o compra → gasto. Abono, nómina, Bizum o transferencia recibida → ingreso.' }
            },
            required: ['fecha', 'descripcion', 'categoria', 'monto', 'tipo']
          }
        }
      },
      required: ['movimientos']
    }
  }

  const instrucciones = `Saca todos los movimientos de dinero de este ${imagen ? 'documento (captura, foto o página de un extracto)' : 'texto de un extracto bancario'}.
Hoy es ${hoy}. Copia los importes y las fechas tal como aparecen; no inventes ninguno.
No cuentes saldos, totales, resúmenes ni movimientos rechazados o pendientes de anular.
Si no hay ningún movimiento, devuelve la lista vacía.
Categorías: ${categorias.join(', ')}`

  const content = imagen
    ? [{ type: 'image', source: { type: 'base64', media_type: imagen.media_type, data: imagen.data } }, { type: 'text', text: instrucciones }]
    : [{ type: 'text', text: `${instrucciones}\n\nTEXTO DEL EXTRACTO:\n${texto}` }]

  let resp
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4096,
        tools: [herramienta],
        tool_choice: { type: 'tool', name: 'registrar_movimientos' },
        messages: [{ role: 'user', content }]
      })
    })
  } catch (err) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudo contactar a Anthropic', detalle: String(err) }) }
  }
  const datos = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Error de la API de Anthropic', detalle: datos.error?.message || resp.status }) }
  }
  if (datos.stop_reason === 'max_tokens') {
    return { statusCode: 422, headers: NO_CACHE, body: JSON.stringify({ error: 'Demasiados movimientos en una sola pieza' }) }
  }
  const uso = (datos.content || []).find(b => b.type === 'tool_use')
  const lista = Array.isArray(uso?.input?.movimientos) ? uso.input.movimientos : []

  const movimientos = lista
    .map(m => ({
      fecha: String(m.fecha || ''),
      descripcion: String(m.descripcion || '').trim() || 'Movimiento',
      categoria: categorias.includes(m.categoria) ? m.categoria : (categorias.find(c => /otros/i.test(c)) || '📦 Otros'),
      monto: Math.abs(Number(m.monto)),
      tipo: m.tipo === 'ingreso' ? 'ingreso' : 'gasto'
    }))
    .filter(m => fechaOk(m.fecha) && m.monto > 0 && isFinite(m.monto))

  return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ movimientos, uso: datos.usage }) }
}
