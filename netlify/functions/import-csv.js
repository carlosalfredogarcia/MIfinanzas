// netlify/functions/import-csv.js
// Tipo A — CSV propio de MiFinanza: parseo JS directo, devuelve movimientos para previsualización.
// Tipo B — CSV de banco externo: dos llamadas pequeñas a Claude:
//   1) cabecera + 3 filas → esquema de columnas (índices fecha/descripción/importe).
//   2) lista de conceptos (extraída con el índice correcto) → nombre simplificado + categoría.
//   Fechas e importes los parsea JS; sin heurístico propio de detección de columnas.

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

const CATS_DEFAULT = [
  '🏠 Alquiler', '💳 Crédito', '📱 Línea', '🏋️ Gym', '⛽ Gasolina',
  '💻 Tecnología', '❤️ Salud', '👕 Ropa', '🎉 Salidas', '🌍 Remesas',
  '⚠️ Gastos Imprevistos', '📋 Trámite', '🚗 Vehículo', '📦 Otros',
  '🛒 Supermercado', '💧 Agua', '🧴 Cuidado personal', '📺 Suscripción', '💡 Luz', '🌐 Internet',
  '💼 Nómina'
]

const CABECERA_PROPIA = 'Fecha,Concepto,Categoría,Importe,Tipo'

function detectarSeparador(linea) {
  const tabs  = (linea.match(/\t/g) || []).length
  const puntos = (linea.match(/;/g) || []).length
  const comas  = (linea.match(/,/g) || []).length
  if (tabs >= puntos && tabs >= comas) return '\t'
  if (puntos >= comas) return ';'
  return ','
}

function parseCSVLinea(linea, sep) {
  const campos = []
  let cur = '', enComillas = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (enComillas) {
      if (c === '"' && linea[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') enComillas = false
      else cur += c
    } else {
      if (c === '"') enComillas = true
      else if (c === sep) { campos.push(cur); cur = '' }
      else cur += c
    }
  }
  campos.push(cur)
  return campos
}

function parsearMonto(str) {
  if (str == null) return NaN
  let s = String(str).trim().replace(/[€$£¥\s]/g, '')
  if (!s) return NaN
  // Notación paréntesis: (45.23) → −45.23
  if (s.startsWith('(') && s.endsWith(')')) return -parsearMonto(s.slice(1, -1))
  // Coma y punto: el último es el decimal
  if (s.includes(',') && s.includes('.')) {
    return s.lastIndexOf(',') > s.lastIndexOf('.')
      ? parseFloat(s.replace(/\./g, '').replace(',', '.'))
      : parseFloat(s.replace(/,/g, ''))
  }
  // Solo coma: decimal o miles (3 dígitos tras la coma → miles)
  if (s.includes(',')) {
    const p = s.split(',')
    if (p.length === 2 && p[1].length === 3 && /^\d+$/.test(p[1])) return parseFloat(s.replace(',', ''))
    return parseFloat(s.replace(',', '.'))
  }
  return parseFloat(s)
}

function normalizarFecha(str) {
  if (!str) return null
  const s = String(str).trim().replace(/['"]/g, '')
  if (!s) return null
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // DD/MM/YYYY · DD-MM-YYYY · DD.MM.YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`
  // YYYY/MM/DD · YYYY.MM.DD
  const m2 = s.match(/^(\d{4})[\/\.](\d{2})[\/\.](\d{2})$/)
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  // DD/MM/YY
  const m3 = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/)
  if (m3) {
    const y = parseInt(m3[3]) > 50 ? `19${m3[3]}` : `20${m3[3]}`
    return `${y}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`
  }
  return null
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

const NO_CACHE = { 'content-type': 'application/json', 'cache-control': 'no-store, no-cache' }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: NO_CACHE, body: JSON.stringify({ error: 'Método no permitido' }) }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '')

  const usuario = await obtenerUsuario(token)
  if (!usuario) {
    return { statusCode: 401, headers: NO_CACHE, body: JSON.stringify({ error: 'No autorizado' }) }
  }

  let body
  try {
    body = JSON.parse(event.body || '{}')
  } catch {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'JSON inválido' }) }
  }

  const csv = String(body.csv || '').replace(/^﻿/, '').trim()
  if (!csv) {
    return { statusCode: 400, headers: NO_CACHE, body: JSON.stringify({ error: 'Falta el contenido del CSV' }) }
  }

  const categorias = Array.isArray(body.categorias) && body.categorias.length
    ? body.categorias
    : CATS_DEFAULT

  const lineas = csv.split(/\r?\n/).filter(l => l.trim())
  const cabecera = lineas[0].trim()
  const sep0 = detectarSeparador(cabecera)
  const cabeceraLimpia = parseCSVLinea(cabecera, sep0).map(s => s.trim()).join(',')

  // ─── Tipo A: CSV propio de MiFinanza ─────────────────────────────────────
  if (cabeceraLimpia === CABECERA_PROPIA) {
    const movimientos = []
    for (let i = 1; i < lineas.length; i++) {
      const cols = parseCSVLinea(lineas[i], sep0).map(s => s.trim())
      if (cols.length < 5) continue
      const [fecha, concepto, categoria, importeStr, tipo] = cols
      const monto = parsearMonto(importeStr)
      if (!fecha || !concepto || isNaN(monto)) continue
      if (tipo === 'Gasto' || tipo === 'Fijo') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'gasto' })
      } else if (tipo === 'Ingreso') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'ingreso' })
      }
    }
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ tipo: 'mifinanza', movimientos }) }
  }

  // ─── Tipo B: CSV de banco externo ────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers: NO_CACHE, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }) }
  }

  const hoy        = new Date().toISOString().slice(0, 10)
  const sep        = detectarSeparador(lineas[0] || '')
  const filasDatos = lineas.slice(1)
  const MAX_FILAS  = 400
  const filasEnviar = filasDatos.slice(0, MAX_FILAS)
  const sepLabel    = sep === '\t' ? 'tabulador' : sep === ';' ? 'punto y coma' : 'coma'

  // Objeto de depuración — se incluye en todas las respuestas
  const dbg = {
    total_lineas: lineas.length,
    total_filas_datos: filasDatos.length,
    filas_a_enviar: filasEnviar.length,
    separador: sepLabel,
    cabecera: lineas[0] || '',
    muestra_filas: lineas.slice(1, 4)
  }

  // ── Llamada 1: detectar esquema de columnas (cabecera + 3 filas de muestra) ─
  const muestra = lineas.slice(0, 4).join('\n')

  const schemaTool = {
    name: 'detectar_esquema',
    description: 'Detecta los índices 0-based de las columnas del extracto bancario a partir de la cabecera y filas de muestra.',
    input_schema: {
      type: 'object',
      properties: {
        fecha_col:       { type: 'integer',           description: 'Índice (0-based) de la columna que contiene la fecha del movimiento' },
        descripcion_col: { type: 'integer',           description: 'Índice (0-based) de la columna con la descripción o concepto del movimiento (texto libre, no número)' },
        monto_col:       { type: ['integer', 'null'], description: 'Índice de la columna de importe único. null si hay columnas separadas de débito y crédito.' },
        debito_col:      { type: ['integer', 'null'], description: 'Índice de la columna de débito/cargo. null si no existe.' },
        credito_col:     { type: ['integer', 'null'], description: 'Índice de la columna de crédito/abono. null si no existe.' },
        tipo_signo: {
          type: 'string',
          enum: ['negativo_es_gasto', 'positivo_es_gasto', 'columnas_separadas'],
          description: 'Cómo determinar si un movimiento es gasto o ingreso'
        }
      },
      required: ['fecha_col', 'descripcion_col', 'tipo_signo']
    }
  }

  let schemaResp
  try {
    schemaResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        tools: [schemaTool],
        tool_choice: { type: 'tool', name: 'detectar_esquema' },
        messages: [{
          role: 'user',
          content: `Extracto bancario con separador ${sepLabel}. Detecta los índices 0-based de las columnas: fecha, descripción del movimiento, importe (o débito/crédito separados), y cómo distinguir gasto de ingreso.

CABECERA Y MUESTRA:
${muestra}`
        }]
      })
    })
  } catch (err) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudo contactar a Anthropic', detalle: String(err), dbg }) }
  }

  if (!schemaResp.ok) {
    const errText = await schemaResp.text()
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Error de la API de Anthropic', detalle: errText, dbg }) }
  }

  const schemaData   = await schemaResp.json()
  dbg.schema_call_raw = schemaData  // LOG 1: respuesta completa de Claude (schema call)

  const schemaToolUse = (schemaData.content || []).find(b => b.type === 'tool_use')
  if (!schemaToolUse) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Claude no pudo detectar el esquema de columnas', dbg }) }
  }

  const esquema = schemaToolUse.input
  dbg.esquema = esquema  // LOG 2: índices detectados

  if (typeof esquema.fecha_col !== 'number' || typeof esquema.descripcion_col !== 'number') {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Esquema de columnas incompleto', dbg }) }
  }

  // ── Llamada 2: simplificar conceptos y categorizar usando el índice correcto ─
  // JS usa descripcion_col devuelto por Claude — sin heurístico propio
  const listaConceptos = filasEnviar
    .map((linea, i) => `${i + 1}. ${(parseCSVLinea(linea, sep)[esquema.descripcion_col] || '').trim()}`)
    .join('\n')

  // LOG 3: primeros 3 conceptos que se van a enviar a Claude
  dbg.primeros_3_conceptos_enviados = listaConceptos.split('\n').slice(0, 3)

  const conceptsTool = {
    name: 'simplificar_conceptos',
    description: 'Para cada concepto bancario de la lista, devuelve el nombre simplificado (1-3 palabras) y la categoría.',
    input_schema: {
      type: 'object',
      properties: {
        conceptos: {
          type: 'array',
          description: 'Un elemento por cada línea numerada de la lista, en el mismo orden.',
          items: {
            type: 'object',
            properties: {
              nombre: {
                type: 'string',
                description: 'Concepto simplificado a 1-3 palabras. Ejemplos: "PAGO TPV CARREFOUR ALAMEDA 22" → "Carrefour", "RECIBO NETFLIX ENE 2026" → "Netflix", "NOMINA EMPRESA SL" → "Nómina Empresa"'
              },
              categoria: {
                type: 'string',
                enum: categorias,
                description: 'Categoría que mejor encaje. Nóminas/salarios → 💼 Nómina. Sin categoría clara → 📦 Otros.'
              }
            },
            required: ['nombre', 'categoria']
          }
        }
      },
      required: ['conceptos']
    }
  }

  let conceptsResp
  try {
    conceptsResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8192,
        tools: [conceptsTool],
        tool_choice: { type: 'tool', name: 'simplificar_conceptos' },
        messages: [{
          role: 'user',
          content: `Para cada concepto bancario de la lista, devuelve el nombre simplificado (1-3 palabras) y la categoría.

CONCEPTOS (${filasEnviar.length} en total${filasDatos.length > MAX_FILAS ? `, de ${filasDatos.length} totales — resto no procesado` : ''}):
${listaConceptos}

Fecha hoy: ${hoy}
Categorías disponibles: ${categorias.join(', ')}`
        }]
      })
    })
  } catch (err) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudo contactar a Anthropic (conceptos)', detalle: String(err), dbg }) }
  }

  if (!conceptsResp.ok) {
    const errText = await conceptsResp.text()
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Error de la API de Anthropic (conceptos)', detalle: errText, dbg }) }
  }

  const conceptsData    = await conceptsResp.json()
  // LOG 4: respuesta completa de Claude (concepts call) — truncar a primeros 5 conceptos para no saturar
  dbg.concepts_call_raw = {
    stop_reason: conceptsData.stop_reason,
    usage: conceptsData.usage,
    content_types: (conceptsData.content || []).map(b => b.type),
    tool_input_preview: (() => {
      const tu = (conceptsData.content || []).find(b => b.type === 'tool_use')
      if (!tu) return null
      const c = tu.input && tu.input.conceptos
      return Array.isArray(c) ? { total: c.length, primeros_5: c.slice(0, 5) } : tu.input
    })()
  }

  const conceptsToolUse = (conceptsData.content || []).find(b => b.type === 'tool_use')
  if (!conceptsToolUse) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Claude no pudo procesar los conceptos', dbg }) }
  }

  const { conceptos } = conceptsToolUse.input
  if (!Array.isArray(conceptos) || conceptos.length === 0) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Respuesta de Claude incompleta', dbg }) }
  }

  // ── Parseo JS de todas las filas usando el esquema detectado ──────────────
  const movimientos = []
  const dbg_filas_saltadas = []

  for (let i = 0; i < filasEnviar.length; i++) {
    const linea = filasEnviar[i]
    if (!linea.trim()) continue

    const cols  = parseCSVLinea(linea, sep)
    const fecha = normalizarFecha(cols[esquema.fecha_col])
    if (!fecha) {
      if (i < 3) dbg_filas_saltadas.push({ i, motivo: 'fecha_nula', val_fecha_col: cols[esquema.fecha_col], cols })
      continue
    }

    const info = conceptos[i]
    if (!info) {
      if (i < 3) dbg_filas_saltadas.push({ i, motivo: 'sin_concepto', fecha })
      continue
    }

    let monto, tipo

    if (esquema.tipo_signo === 'columnas_separadas') {
      const deb = esquema.debito_col  != null ? parsearMonto(cols[esquema.debito_col]  || '') : NaN
      const cre = esquema.credito_col != null ? parsearMonto(cols[esquema.credito_col] || '') : NaN
      if (!isNaN(deb) && deb > 0)      { monto = deb; tipo = 'gasto'   }
      else if (!isNaN(cre) && cre > 0) { monto = cre; tipo = 'ingreso' }
      else {
        if (i < 3) dbg_filas_saltadas.push({ i, motivo: 'deb_cre_vacios', deb, cre, cols })
        continue
      }
    } else {
      if (esquema.monto_col == null) {
        if (i < 3) dbg_filas_saltadas.push({ i, motivo: 'monto_col_null' })
        continue
      }
      const raw = parsearMonto(cols[esquema.monto_col] || '')
      if (isNaN(raw) || raw === 0) {
        if (i < 3) dbg_filas_saltadas.push({ i, motivo: 'monto_invalido', val_monto_col: cols[esquema.monto_col], raw })
        continue
      }
      monto = Math.abs(raw)
      tipo  = esquema.tipo_signo === 'negativo_es_gasto'
        ? (raw < 0 ? 'gasto' : 'ingreso')
        : (raw > 0 ? 'gasto' : 'ingreso')
    }

    movimientos.push({
      fecha,
      descripcion: info.nombre    || '',
      categoria:   info.categoria || '📦 Otros',
      monto,
      tipo
    })
  }

  dbg.parseo_filas_saltadas = dbg_filas_saltadas
  dbg.movimientos_encontrados = movimientos.length

  return {
    statusCode: 200,
    headers: NO_CACHE,
    body: JSON.stringify({ tipo: 'banco', movimientos, gastos: movimientos, dbg })
  }
}
