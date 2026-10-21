// netlify/functions/import-csv.js
// Tipo A — CSV propio de MiFinanza: parseo JS directo, devuelve movimientos para previsualización.
// Tipo B — CSV de banco externo: dos llamadas pequeñas a Claude:
//   1) Primeras 20 filas numeradas → Claude detecta qué fila es la cabecera real (puede haber
//      metadata del banco antes), y los índices de columna para fecha/descripción/importe.
//   2) Lista de conceptos (extraída con el índice correcto) → nombre simplificado + categoría.
//      Cada concepto distinto se envía una sola vez (MERCADONA x80 → 1), en lotes con reintento.
//   Fechas e importes los parsea JS puro; sin heurístico propio de detección de columnas.
// El límite lo decide el servidor: si el archivo trae más movimientos de los que quedan,
// se importan los más recientes y se devuelve cuántos quedaron fuera (recortados).

const { obtenerUsuario, estadoLimite, analisisHoy, registrarAnalisis, actualizarAnalisis, MAX_ANALISIS_DIA } = require('../lib/limite')

// Modelo configurable desde Netlify (IMPORT_MODEL) para probar otro sin tocar código
const MODELO = process.env.IMPORT_MODEL || 'claude-haiku-4-5-20251001'
// Precio en $ por millón de tokens [entrada, salida]
const PRECIOS = { 'claude-haiku-4-5': [1, 5], 'claude-haiku-5-5': [0.10, 0.50] }
const precioModelo = m => PRECIOS[Object.keys(PRECIOS).find(k => m.startsWith(k))] || [1, 5]
const CHUNK_SIZE   = 30
const PARALELO     = 8
const TIEMPO_REINTENTO_MS = 6000 // no reintentar si ya se gastó este tiempo (Netlify corta a los 10 s)

const CATS_DEFAULT = [
  '🏠 Alquiler', '💳 Crédito', '📱 Línea', '🏋️ Gym', '⛽ Gasolina',
  '💻 Tecnología', '❤️ Salud', '👕 Ropa', '🎉 Salidas', '🌍 Remesas',
  '⚠️ Gastos Imprevistos', '📋 Trámite', '🚗 Vehículo', '📦 Otros',
  '🛒 Supermercado', '💧 Agua', '🧴 Cuidado personal', '📺 Suscripción', '💡 Luz', '🌐 Internet',
  '💼 Nómina'
]

// Detecta si una línea es la cabecera MiFinanza y devuelve los índices de columna,
// o null si no lo es. Tolera BOM, distintas codificaciones de "Categoría",
// mayúsculas/minúsculas y orden de columnas diferente (p.ej. XLSX desde Numbers).
function detectarCabeceraPropia(linea, sep) {
  const campos = parseCSVLinea(linea, sep).map(s => s.trim())
  if (campos.length < 5) return null
  const cl = campos.map(s => s.toLowerCase())
  // 'fecha' puede llevar BOM (ï»¿fecha, ﻿fecha) → buscar que contenga 'fecha'
  const fechaCol    = cl.findIndex(c => c.includes('fecha'))
  const conceptoCol = cl.findIndex(c => c === 'concepto')
  const catCol      = cl.findIndex(c => c.startsWith('categor'))
  const importeCol  = cl.findIndex(c => c === 'importe')
  const tipoCol     = cl.findIndex(c => c === 'tipo')
  if (fechaCol === -1 || conceptoCol === -1 || importeCol === -1 || tipoCol === -1) return null
  return { fechaCol, conceptoCol, catCol: catCol === -1 ? null : catCol, importeCol, tipoCol }
}

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

const NO_CACHE = { 'content-type': 'application/json', 'cache-control': 'no-store, no-cache' }

// Llamada a Claude con reintentos (429, 5xx o red) que suma los tokens usados en `uso`
async function llamarClaude(apiKey, body, uso, t0) {
  for (let intento = 0; ; intento++) {
    let resp, data
    try {
      resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: MODELO, ...body })
      })
      data = await resp.json().catch(() => ({}))
    } catch (err) {
      resp = { ok: false, status: 0 }; data = { error: String(err) }
    }
    if (data.usage) {
      uso.llamadas++
      uso.input_tokens  += data.usage.input_tokens  || 0
      uso.output_tokens += data.usage.output_tokens || 0
    }
    const reintentable = !resp.ok && (resp.status === 0 || resp.status === 429 || resp.status >= 500)
    if (!reintentable || intento >= 2 || Date.now() - t0 > TIEMPO_REINTENTO_MS) return { ok: resp.ok, status: resp.status, data }
    await new Promise(r => setTimeout(r, 400 * (intento + 1)))
  }
}

// Índices de los movimientos que entran en el cupo: los más recientes y, en la primera
// importación, solo los de los últimos 12 meses
function elegirRecientes(fechas, estado, hoy) {
  const desde = new Date(hoy); desde.setFullYear(desde.getFullYear() - 1)
  const minFecha = estado.primera ? desde.toISOString().slice(0, 10) : ''
  const validos = fechas.map((f, i) => ({ f, i })).filter(x => x.f && x.f >= minFecha)
  validos.sort((a, b) => b.f.localeCompare(a.f))
  const elegidos = validos.slice(0, estado.cupo).map(x => x.i).sort((a, b) => a - b)
  return { elegidos, recortados: fechas.filter(Boolean).length - elegidos.length }
}

// MERCADONA 1234 12/03 y MERCADONA 5678 15/04 → mismo concepto
const costeUsd = uso => {
  const [pin, pout] = precioModelo(uso.modelo)
  return +((uso.input_tokens * pin + uso.output_tokens * pout) / 1e6).toFixed(4)
}

const claveConcepto = txt => txt.toUpperCase().replace(/\d+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim() || txt

// Respuesta 402 cuando el usuario no puede importar más; el navegador muestra el aviso de límite
function sinLimite(estado, nuevos) {
  return {
    statusCode: 402, headers: NO_CACHE,
    body: JSON.stringify({ error: 'Has llegado al límite de movimientos importados', limite: true, usados: estado.usados, max: estado.limite, nuevos })
  }
}

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

  const lineas = csv.split(/\r\n|\r|\n/).filter(l => l.trim())

  // Límite de importación: lo decide el servidor, no el navegador
  let estado
  try {
    estado = await estadoLimite(usuario.id, token)
  } catch (e) {
    return { statusCode: 503, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudo comprobar tu límite de importación. Inténtalo de nuevo.' }) }
  }

  // Buscar cabecera MiFinanza en las primeras 5 filas.
  // XLSX exportado desde SheetJS puede tener filas vacías (,,,,) al inicio,
  // o el orden de columnas puede diferir según Numbers/Excel.
  let tipoA_idx = -1
  let tipoA_cols = null
  for (let i = 0; i < Math.min(5, lineas.length); i++) {
    const sep = detectarSeparador(lineas[i])
    const cols = detectarCabeceraPropia(lineas[i], sep)
    if (cols) { tipoA_idx = i; tipoA_cols = cols; break }
  }

  const cabecera = lineas[tipoA_idx >= 0 ? tipoA_idx : 0].trim()
  const sep0 = detectarSeparador(cabecera)

  // ─── Tipo A: CSV propio de MiFinanza ─────────────────────────────────────
  if (tipoA_idx >= 0) {
    const { fechaCol, conceptoCol, catCol, importeCol, tipoCol } = tipoA_cols
    const minCols = Math.max(fechaCol, conceptoCol, importeCol, tipoCol) + 1
    const movimientos = []
    const dbgTiposA = []
    for (let i = tipoA_idx + 1; i < lineas.length; i++) {
      const cols = parseCSVLinea(lineas[i], sep0).map(s => s.trim())
      if (cols.length < minCols) continue
      const fecha      = cols[fechaCol]
      const concepto   = cols[conceptoCol]
      const categoria  = catCol !== null ? (cols[catCol] || '📦 Otros') : '📦 Otros'
      const importeStr = cols[importeCol]
      const tipo       = cols[tipoCol] || ''
      const monto = parsearMonto(importeStr)
      if (!fecha || !concepto || isNaN(monto)) continue
      if (dbgTiposA.length < 5) dbgTiposA.push(JSON.stringify(tipo))
      const tipoLow = tipo.toLowerCase()
      if (tipoLow === 'gasto' || tipoLow === 'fijo' || tipoLow === 'gasto fijo') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'gasto' })
      } else if (tipoLow === 'ingreso') {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'ingreso' })
      } else {
        movimientos.push({ fecha, descripcion: concepto, categoria, monto, tipo: 'gasto' })
      }
    }
    if (estado.cupo === 0) return sinLimite(estado, movimientos.length)
    const selA = elegirRecientes(movimientos.map(m => normalizarFecha(m.fecha)), estado, new Date().toISOString().slice(0, 10))
    if (selA.recortados > 0) movimientos.splice(0, movimientos.length, ...selA.elegidos.map(i => movimientos[i]))
    const dbgPriCats = movimientos.slice(0, 3).map(m => m.categoria)
    const dbgPriLineas = lineas.slice(tipoA_idx, tipoA_idx + 4).map(l => l.slice(0, 120))
    return { statusCode: 200, headers: NO_CACHE, body: JSON.stringify({ tipo: 'mifinanza', movimientos, recortados: selA.recortados, primera: estado.primera, dbg: { cabecera_detectada: 'tipoA', header_row: tipoA_idx, cols: tipoA_cols, primeros_tipos_raw: dbgTiposA, primeras_cats: dbgPriCats, primeras_lineas: dbgPriLineas } }) }
  }

  // ─── Tipo B: CSV de banco externo ────────────────────────────────────────
  const filasEstimadas = Math.max(0, lineas.length - 1)
  if (estado.cupo === 0) return sinLimite(estado, filasEstimadas)
  if (await analisisHoy(usuario.id).catch(() => 0) >= MAX_ANALISIS_DIA) {
    return { statusCode: 429, headers: NO_CACHE, body: JSON.stringify({ error: `Has analizado ${MAX_ANALISIS_DIA} archivos en las últimas 24 horas. Vuelve a intentarlo mañana.` }) }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { statusCode: 500, headers: NO_CACHE, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY no configurada en el servidor' }) }
  }
  const t0 = Date.now()
  const uso = { modelo: MODELO, llamadas: 0, input_tokens: 0, output_tokens: 0 }
  const usoId = await registrarAnalisis(usuario.id, { filas: filasEstimadas, primera: estado.primera, modelo: MODELO })

  const hoy       = new Date().toISOString().slice(0, 10)
  const MAX_FILAS = 2000

  // Objeto de depuración — se incluye en todas las respuestas
  const dbg = { total_lineas: lineas.length }

  // ── Llamada 1: identificar cabecera real + esquema de columnas ────────────
  // Enviamos las primeras 20 filas numeradas para que Claude detecte:
  //   - header_row: qué fila es la cabecera (puede haber metadata del banco antes)
  //   - first_data_row: primer índice con movimientos reales
  //   - índices de columna para fecha, descripción, importe, tipo
  const MUESTRA_N = 20
  const muestraNum = lineas.slice(0, MUESTRA_N).map((l, i) => `[${i}] ${l}`).join('\n')
  dbg.muestra_enviada = lineas.slice(0, MUESTRA_N)

  const schemaTool = {
    name: 'detectar_esquema',
    description: 'Analiza un extracto bancario e identifica la fila de cabecera real y los índices de columna.',
    input_schema: {
      type: 'object',
      properties: {
        header_row: {
          type: 'integer',
          description: 'Índice (según los corchetes) de la fila que contiene los nombres de columna del extracto. Puede haber líneas de metadata del banco antes de esta fila.'
        },
        first_data_row: {
          type: 'integer',
          description: 'Índice de la primera fila con datos reales de movimientos (normalmente header_row + 1).'
        },
        fecha_col: {
          type: 'integer',
          description: 'Índice 0-based de la columna de fecha del movimiento.'
        },
        descripcion_col: {
          type: 'integer',
          description: 'Índice 0-based de la columna de descripción o concepto (texto libre, nunca un número).'
        },
        monto_col: {
          type: ['integer', 'null'],
          description: 'Índice de la columna de importe único (puede ser positivo o negativo). null si hay columnas separadas de débito y crédito.'
        },
        debito_col: {
          type: ['integer', 'null'],
          description: 'Índice de la columna de débito/cargo (solo valor absoluto). null si no existe.'
        },
        credito_col: {
          type: ['integer', 'null'],
          description: 'Índice de la columna de crédito/abono (solo valor absoluto). null si no existe.'
        },
        tipo_signo: {
          type: 'string',
          enum: ['negativo_es_gasto', 'positivo_es_gasto', 'columnas_separadas'],
          description: 'Cómo distinguir gasto de ingreso: negativo_es_gasto, positivo_es_gasto, o columnas_separadas.'
        }
      },
      required: ['header_row', 'first_data_row', 'fecha_col', 'descripcion_col', 'tipo_signo']
    }
  }

  const schemaResp = await llamarClaude(apiKey, {
    max_tokens: 400,
    tools: [schemaTool],
    tool_choice: { type: 'tool', name: 'detectar_esquema' },
    messages: [{
      role: 'user',
      content: `Extracto bancario. Identifica la fila de cabecera real (puede haber metadata antes) y los índices de columna para fecha, descripción del movimiento, importe y tipo gasto/ingreso.

PRIMERAS ${Math.min(MUESTRA_N, lineas.length)} FILAS DEL ARCHIVO:
${muestraNum}`
    }]
  }, uso, t0)

  if (!schemaResp.ok) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Error de la API de Anthropic', detalle: schemaResp.data, dbg }) }
  }

  const schemaData    = schemaResp.data
  dbg.schema_call_raw = schemaData

  const schemaToolUse = (schemaData.content || []).find(b => b.type === 'tool_use')
  if (!schemaToolUse) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Claude no pudo detectar el esquema de columnas', dbg }) }
  }

  const esquema = schemaToolUse.input
  dbg.esquema = esquema

  if (typeof esquema.header_row !== 'number' || typeof esquema.first_data_row !== 'number' ||
      typeof esquema.fecha_col !== 'number'   || typeof esquema.descripcion_col !== 'number') {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Esquema de columnas incompleto', dbg }) }
  }

  // Usar el separador de la cabecera real (no necesariamente lineas[0])
  const firstDataRow = Math.max(1, Math.min(esquema.first_data_row, lineas.length - 1))
  const sep          = detectarSeparador(lineas[esquema.header_row] || lineas[0])
  const sepLabel     = sep === '\t' ? 'tabulador' : sep === ';' ? 'punto y coma' : 'coma'
  dbg.separador         = sepLabel
  dbg.first_data_row    = firstDataRow

  // Extraer filas de datos reales descartando toda la metadata
  let filasEnviar = lineas.slice(firstDataRow, firstDataRow + MAX_FILAS)
  // Solo los que entran en el cupo (los más recientes): no se paga IA por lo que no se importa
  const selB = elegirRecientes(filasEnviar.map(l => normalizarFecha(parseCSVLinea(l, sep)[esquema.fecha_col])), estado, hoy)
  filasEnviar = selB.elegidos.map(i => filasEnviar[i])
  dbg.filas_datos = filasEnviar.length
  dbg.recortados  = selB.recortados

  // ── Llamada 2: simplificar conceptos en lotes paralelos ──────────────────
  // Cada concepto distinto va una sola vez; luego se reparte a todas sus filas
  const conceptosFila = filasEnviar.map(linea =>
    (parseCSVLinea(linea, sep)[esquema.descripcion_col] || '').trim()
  )
  const indiceUnico = new Map()
  const conceptosTodos = []
  const unicoDeFila = conceptosFila.map(txt => {
    const k = claveConcepto(txt)
    if (!indiceUnico.has(k)) { indiceUnico.set(k, conceptosTodos.length); conceptosTodos.push(txt) }
    return indiceUnico.get(k)
  })
  dbg.conceptos_unicos = conceptosTodos.length

  dbg.primeros_3_conceptos_enviados = conceptosTodos.slice(0, 3)

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

  // Partir en lotes y lanzarlos en paralelo (como mucho PARALELO a la vez)
  const chunks = []
  for (let s = 0; s < conceptosTodos.length; s += CHUNK_SIZE) {
    chunks.push(conceptosTodos.slice(s, s + CHUNK_SIZE))
  }
  dbg.lotes = chunks.length

  const procesarLote = async (chunk, ci) => {
    const lista = chunk.map((txt, j) => `${j + 1}. ${txt}`).join('\n')
    const r = await llamarClaude(apiKey, {
      max_tokens: 4096,
      tools: [conceptsTool],
      tool_choice: { type: 'tool', name: 'simplificar_conceptos' },
      messages: [{
        role: 'user',
        content: `Para cada concepto bancario devuelve nombre simplificado (1-3 palabras) y categoría. Incluye TODOS los movimientos de la lista sin excepción, incluso los que tengan descripción genérica o vacía. No descartes ninguna fila — la lista de salida debe tener exactamente el mismo número de elementos que la lista de entrada.

CONCEPTOS (lote ${ci + 1}/${chunks.length}):
${lista}

Fecha hoy: ${hoy}
Categorías: ${categorias.join(', ')}`
      }]
    }, uso, t0)
    const tu = r.ok && (r.data.content || []).find(b => b.type === 'tool_use')
    return tu && Array.isArray(tu.input.conceptos) ? tu.input.conceptos : null
  }
  const chunkResults = new Array(chunks.length)
  let siguiente = 0
  await Promise.all(Array.from({ length: Math.min(PARALELO, chunks.length) }, async () => {
    while (siguiente < chunks.length) { const ci = siguiente++; chunkResults[ci] = await procesarLote(chunks[ci], ci) }
  }))

  // Un lote que falla no tira la importación: sus conceptos quedan en "📦 Otros" para revisarlos
  const lotesFallidos = chunkResults.filter(r => !r).length
  if (chunks.length && lotesFallidos === chunks.length) {
    await actualizarAnalisis(usoId, { input_tokens: uso.input_tokens, output_tokens: uso.output_tokens, coste_usd: costeUsd(uso) })
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'No se pudieron categorizar los movimientos. Inténtalo de nuevo.', dbg }) }
  }
  dbg.lotes_fallidos = lotesFallidos
  const conceptosUnicos = []
  chunks.forEach((chunk, ci) => chunk.forEach((txt, j) => {
    conceptosUnicos.push(chunkResults[ci]?.[j] || { nombre: txt.slice(0, 40), categoria: '📦 Otros' })
  }))
  const conceptos = unicoDeFila.map(u => conceptosUnicos[u])

  dbg.concepts_preview = { total: conceptos.length, primeros_5: conceptos.slice(0, 5) }

  if (conceptos.length === 0) {
    return { statusCode: 502, headers: NO_CACHE, body: JSON.stringify({ error: 'Respuesta de Claude incompleta', dbg }) }
  }

  // ── Parseo JS de todas las filas usando el esquema detectado ──────────────
  const movimientos       = []
  const dbg_filas_saltadas = []
  const rawsValidos        = [] // para auto-corrección de tipo_signo

  for (let i = 0; i < filasEnviar.length; i++) {
    const linea = filasEnviar[i]
    if (!linea.trim()) continue

    const cols  = parseCSVLinea(linea, sep)
    const fecha = normalizarFecha(cols[esquema.fecha_col])
    if (!fecha) {
      if (dbg_filas_saltadas.length < 5) dbg_filas_saltadas.push({ i, motivo: 'fecha_nula', val: cols[esquema.fecha_col], cols })
      continue
    }

    const info = conceptos[i]
    if (!info) {
      if (dbg_filas_saltadas.length < 5) dbg_filas_saltadas.push({ i, motivo: 'sin_concepto', fecha })
      continue
    }

    let monto, tipo

    if (esquema.tipo_signo === 'columnas_separadas') {
      const deb = esquema.debito_col  != null ? parsearMonto(cols[esquema.debito_col]  || '') : NaN
      const cre = esquema.credito_col != null ? parsearMonto(cols[esquema.credito_col] || '') : NaN
      if      (!isNaN(deb) && deb > 0) { monto = deb; tipo = 'gasto'   }
      else if (!isNaN(cre) && cre > 0) { monto = cre; tipo = 'ingreso' }
      else {
        if (dbg_filas_saltadas.length < 5) dbg_filas_saltadas.push({ i, motivo: 'deb_cre_vacios', deb, cre, cols })
        continue
      }
    } else {
      if (esquema.monto_col == null) {
        if (dbg_filas_saltadas.length < 5) dbg_filas_saltadas.push({ i, motivo: 'monto_col_null' })
        continue
      }
      const raw = parsearMonto(cols[esquema.monto_col] || '')
      if (isNaN(raw)) {
        if (dbg_filas_saltadas.length < 5) dbg_filas_saltadas.push({ i, motivo: 'monto_invalido', val: cols[esquema.monto_col], raw })
        continue
      }
      rawsValidos.push(raw)
      monto = Math.abs(raw)
      tipo  = raw === 0
        ? 'gasto'
        : esquema.tipo_signo === 'negativo_es_gasto'
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

  // ── Auto-corrección de tipo_signo si la IA lo detectó al revés ──────────
  // Si hay ambos signos en los datos pero >98% salieron del mismo tipo, se invierte.
  if (esquema.tipo_signo !== 'columnas_separadas' && movimientos.length > 5 && rawsValidos.length > 5) {
    const nGastos   = movimientos.filter(m => m.tipo === 'gasto').length
    const nIngresos = movimientos.filter(m => m.tipo === 'ingreso').length
    const hayAmbosSig = rawsValidos.some(r => r > 0) && rawsValidos.some(r => r < 0)
    if (hayAmbosSig && (nGastos / movimientos.length > 0.98 || nIngresos / movimientos.length > 0.98)) {
      dbg.tipo_signo_autocorregido = true
      dbg.tipo_signo_original      = esquema.tipo_signo
      for (const mov of movimientos) {
        mov.tipo = mov.tipo === 'gasto' ? 'ingreso' : 'gasto'
      }
    }
  }

  dbg.parseo_filas_saltadas      = dbg_filas_saltadas
  dbg.movimientos_encontrados    = movimientos.length
  dbg.tipo_signo_detectado       = esquema.tipo_signo
  dbg.tipo_signo_autocorregido   = dbg.tipo_signo_autocorregido || false
  dbg.monto_col                  = esquema.monto_col
  dbg.debito_col                 = esquema.debito_col
  dbg.credito_col                = esquema.credito_col
  dbg.primeros_5_montos_raw      = filasEnviar.slice(0, 5).map(l => parseCSVLinea(l, sep)[esquema.monto_col])

  uso.coste_usd = costeUsd(uso)
  uso.segundos   = +((Date.now() - t0) / 1000).toFixed(1)
  dbg.uso = uso
  await actualizarAnalisis(usoId, { filas: filasEnviar.length, input_tokens: uso.input_tokens, output_tokens: uso.output_tokens, coste_usd: uso.coste_usd })

  return {
    statusCode: 200,
    headers: NO_CACHE,
    body: JSON.stringify({ tipo: 'banco', movimientos, gastos: movimientos, recortados: selB.recortados, primera: estado.primera, uso, dbg })
  }
}
