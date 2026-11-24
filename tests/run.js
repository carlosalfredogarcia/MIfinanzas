// Ejecuta todas las pruebas de tests/pruebas. Uso:
//   npm test               → compara con las fotos de texto guardadas en tests/fotos
//   npm run actualizar     → vuelve a guardar las fotos (solo tras revisar que el cambio es correcto)
const fs = require('fs'), path = require('path'), assert = require('assert')
const { abrir, cerrarNavegador, textoVisible } = require('./lib')

const ACTUALIZAR = process.argv.includes('--actualizar')
const FILTRO = process.argv.slice(2).find(a => !a.startsWith('--'))
const FOTOS = path.join(__dirname, 'fotos')
fs.mkdirSync(FOTOS, { recursive: true })

const t = {
  abrir,
  textoVisible,
  igual: (real, esperado, msg) => assert.deepStrictEqual(real, esperado, msg),
  ok: (valor, msg) => assert.ok(valor, msg),
  contiene: (texto, trozo, msg) => assert.ok(String(texto).includes(trozo), (msg || 'No aparece') + `: «${trozo}»`),
  sinErrores: pg => assert.deepStrictEqual(pg.errores, [], 'Errores de JavaScript en la página'),
  // Compara el texto con la foto guardada; si no existe, la crea
  foto(nombre, texto) {
    const f = path.join(FOTOS, nombre + '.txt')
    if (ACTUALIZAR || !fs.existsSync(f)) { fs.writeFileSync(f, texto + '\n'); return }
    const guardado = fs.readFileSync(f, 'utf8').trimEnd()
    if (guardado !== texto) {
      const a = guardado.split('\n'), b = texto.split('\n')
      const i = a.findIndex((l, k) => l !== b[k])
      throw new Error(`La foto «${nombre}» cambió en la línea ${i + 1}:\n  antes: ${a[i]}\n  ahora: ${b[i]}\n(si el cambio es correcto: npm run actualizar)`)
    }
  },
}

;(async () => {
  // Las pruebas de inglés solo cuando se piden (INGLES=1 o «npm test -- ingl»): las traducciones se hacen
  // en una sesión aparte al final, no en cada cambio.
  // Se ejecutan de 5 en 5 a la vez (cada una abre su propia ventana): antes una detrás de otra tardaba 3–4 min.
  const INGLES = process.env.INGLES || (FILTRO && 'inglés ingles'.includes(FILTRO))
  const lista = []
  for (const archivo of fs.readdirSync(path.join(__dirname, 'pruebas')).filter(f => f.endsWith('.js')).sort()) {
    if (archivo.includes('ingles') && !INGLES) continue
    for (const { nombre, prueba } of require(path.join(__dirname, 'pruebas', archivo))) {
      const titulo = `${archivo.replace('.js', '')} › ${nombre}`
      if (FILTRO && !titulo.includes(FILTRO)) continue
      lista.push({ titulo, prueba })
    }
  }
  const A_LA_VEZ = +process.env.A_LA_VEZ || 5
  const resultados = new Array(lista.length)
  let siguiente = 0
  await Promise.all(Array.from({ length: Math.min(A_LA_VEZ, lista.length) }, async () => {
    while (siguiente < lista.length) {
      const k = siguiente++, { titulo, prueba } = lista[k]
      try { await prueba(t); resultados[k] = '  ✓ ' + titulo }
      catch (e) { resultados[k] = '  ✗ ' + titulo + '\n    ' + String(e.message).split('\n').join('\n    ') }
    }
  }))
  resultados.forEach(r => console.log(r))
  const fallos = resultados.filter(r => r.startsWith('  ✗')).length, total = lista.length
  await cerrarNavegador()
  console.log(`\n${total - fallos} de ${total} pruebas correctas`)
  process.exit(fallos ? 1 : 0)
})()
