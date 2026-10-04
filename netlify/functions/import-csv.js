// netlify/functions/import-csv.js
// Tipo A — CSV propio de MiFinanza (cabecera: Fecha,Concepto,Categoría,Importe,Tipo):
//   procesa directamente y guarda en Supabase sin llamar a Claude.
// Tipo B — CSV de banco externo (cualquier otro formato):
//   envía a Claude para normalizar y devuelve movimientos con tipo (gasto/ingreso).

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

const CATS_DEFAULT = [
  '🏠 Alquiler', '💳 Crédito', '📱 Línea', '🏋️ Gym', '⛽ Gasolina',
  '💻 Tecnología', '❤️ Salud', '👕 Ropa', '🎉 Salidas', '🌍 Remesas',
  '⚠️ Gastos Imprevistos', '📋 Trámite', '🚗 Vehículo', '📦 Otros',
  '🛒 Supermercado', '💧 Agua', '🧴 Cuidado personal', '📺 Suscripción', '💡 Luz', '🌐 Internet'
]

const CABECERA_PROPIA = 'Fecha,Concepto,Categoría,Importe,Tipo'

function detectarSeparador(linea) {
  const tabs = (linea.match(/\t/g) || []).length
  const puntos = (linea.match(/;/g) || []).length
  const comas = (linea.match(/,/g) || []).length
  if (tabs >= puntos && tabs >= comas) return '\t'
  if (puntos >= comas) return ';'
  return ','
}

function parseCSVLinea(linea, sep) {
  const campos = []
  let cur = ''
  let enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') { enComillas = false }
      else { cur += c }
    } else {
      if (c === '"') { enComillas = true }
      else if (c === sep) { campos.push(cur); cur = '' }
      else { cur += c }
    }
  }
  campos.push(cur)
  return campos
}

function parsearMonto(str) {
  if (str == null) return NaN
  const s = String(str).trim()
  // Si tiene coma y punto, el último es el decimal
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',')
    const lastDot = s.lastIndexOf('.')
    return lastComma > lastDot
      ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
      : parseFloat(s.replace(/,/g, ''))
  }
  // Solo coma → puede ser decimal o miles; si hay exactamente 3 dígitos después asumimos miles
  if (s.includes(',')) {
    const partes = s.split(',')
    if (partes.length === 2 && partes[1].length === 3 && /^\d+$/.test(partes[1])) {
      return parseFloat(s.replace(',', ''))
    }
    return parseFloat(s.replace(',', '.'))
  }
  return parseFloat(s)
}

async function obtenerUsuario(token) {
  if (!token) return null
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY }
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.id ? data : null
  } catch {
    return null
  }
}

async function insertarFilas(tabla, filas, token) {
  if (!filas.length) return true
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      apikey: SUPABASE_KEY,
      prefer: 'return=minimal'
    },
    body: JSON.stringify(filas)
  })
  return resp.ok
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Método no permitido' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const usuario = await obtenerUsuario(token)
  if (!usuario) {
    return { statusCode: 401, body: JSON.stringify({ error: 'No autorizado' }) }
  }
  const uid = usuario.id

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  // Quitar BOM si viene
  const csv = String(body.csv || '').replace(/^﻿/, '').trim()
  if (!csv) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el contenido del CSV' }) }
  }

  const categorias = Array.isArray(body.categorias) && body.categorias.length
    ? body.categorias
    : CATS_DEFAULT

  const lineas = csv.split(/\r?\n/).filter(l => l.trim())
  const cabecera = lineas[0].trim()
  // Normalizar cabecera: parsear campos (quita comillas) y reunir con coma
  const sep0 = detectarSeparador(cabecera)
  const cabeceraLimpia = parseCSVLinea(cabecera, sep0).map(s => s.trim()).join(',')

  // ─── Tipo A: CSV propio de MiFinanza — parsear y devolver para previsualización ──
  if (cabeceraLimpia === CABECERA_PROPIA) {
    const movimientos = []

    for (let i = 1; i < lineas.length; i++) {
      const cols = parseCSVLinea(lineas[i], sep0).map(s => s.trim())
      if (cols.length < 5) continue
      const [fecha, concepto, categoria, importeStr, tipo] = cols
      const monto = parsearMonto(importeStr)
      if (!fecha || !concepto || isNaN(monto)) continue

      if (tipo === 'Gasto') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'gasto' })
      } else if (tipo === 'Ingreso') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'ingreso' })
      } else if (tipo === 'Fijo') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'gasto' })
      }
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'mifinanza', movimientos })
    }
  }

  // ─── Tipo B: CSV de banco externo — enviar a Claude ────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }) }
  }

  const csvFinal = lineas.slice(0, 200).join('\n')
  const truncado = lineas.length > 200
  const hoy = new Date().toISOString().slice(0, 10)

  const separadorDetectado = detectarSeparador(lineas[0] || '')

  const tool = {
    name: 'registrar_movimientos',
    description: 'Extrae todos los movimientos del extracto bancario CSV: tanto gastos/débitos como ingresos/abonos.',
    input_schema: {
      type: 'object',
      properties: {
        movimientos: {
          type: 'array',
          description: 'Un elemento por cada movimiento encontrado.',
          items: {
            type: 'object',
            properties: {
              descripcion: { type: 'string', description: 'Descripción limpia del movimiento tal como aparece en el extracto' },
              categoria: {
                type: 'string',
                enum: categorias,
                description: 'Categoría de la lista que mejor encaje con el movimiento. Para ingresos usa "📦 Otros" si no hay una adecuada.'
              },
              monto: { type: 'number', description: 'Valor absoluto del monto (siempre positivo), sin símbolo de moneda' },
              fecha: { type: 'string', description: `Fecha en formato YYYY-MM-DD. Si falta el año usa ${hoy.slice(0, 4)}.` },
              tipo: {
                type: 'string',
                enum: ['gasto', 'ingreso'],
                description: 'gasto si es un débito, compra, pago o cargo; ingreso si es un abono, cobro o transferencia recibida. Infiere por el signo del importe o por palabras clave en la descripción.'
              }
            },
            required: ['descripcion', 'categoria', 'monto', 'fecha', 'tipo']
          }
        }
      },
      required: ['movimientos']
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
        tool_choice: { type: 'tool', name: 'registrar_movimientos' },
        messages: [{
          role: 'user',
          content: `Analiza el siguiente extracto bancario en CSV${truncado ? ' (truncado a las primeras 200 líneas)' : ''} e identifica todos los movimientos (gastos e ingresos).

El separador detectado es: ${separadorDetectado === '\t' ? 'tabulador' : separadorDetectado === ';' ? 'punto y coma' : 'coma'}. Los importes pueden usar coma o punto como separador decimal. Si hay una columna con importes negativos, son gastos; los positivos son ingresos. Si hay columnas separadas de débito/crédito, extrae ambas.

Categorías disponibles: ${categorias.join(', ')}
Fecha de hoy: ${hoy}

EXTRACTO:
${csvFinal}`
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

  const movimientos = toolUse.input.movimientos || []
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    // Incluir gastos como alias de movimientos para compatibilidad con versiones
    // anteriores del front-end que pudieran estar en caché del CDN.
    body: JSON.stringify({ tipo: 'banco', movimientos, gastos: movimientos })
  }
}
