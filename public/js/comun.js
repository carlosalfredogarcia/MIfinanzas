// comun.js — utilidades compartidas por todas las pantallas (se carga después de auth.js).
// Todo cuelga de window.MF para no chocar con los nombres de cada página.
;(function () {
  // Categorías con las que empieza un usuario nuevo (perfil.categorias vacío)
  const CATS_DEFAULT = '🏠 Alquiler,💳 Crédito,📱 Línea,🏋️ Gym,⛽ Gasolina,💻 Tecnología,❤️ Salud,👕 Ropa,🎉 Salidas,🌍 Remesas,⚠️ Gastos Imprevistos,📋 Trámite,🚗 Vehículo,📦 Otros,🛒 Supermercado,💧 Agua,🧴 Cuidado personal,📺 Suscripción,💡 Luz,🌐 Internet,💼 Nómina'
  // Las mismas sin las de ingresos, para elegir la categoría de un gasto
  const CATS_GASTO = CATS_DEFAULT.split(',').filter(c => c !== '💼 Nómina').join(',')

  // Importe en formato español con la moneda del usuario: 1.234,56 € · $1.234,56.
  // decimales: número fijo; si se omite, 0 cuando es entero y 2 cuando no.
  // moneda: otra distinta de la del usuario (p. ej. la de un préstamo).
  function dinero(n, decimales, moneda) {
    const v = parseFloat(n) || 0
    const d = decimales ?? (Math.abs(v - Math.round(v)) < 0.005 ? 0 : 2)
    const [ent, frac] = Math.abs(v).toFixed(d).split('.')
    // En inglés: 1,234.56 y el símbolo delante (€1,234.56)
    const en = window.MF_IDIOMA === 'en'
    const num = ent.replace(/\B(?=(\d{3})+(?!\d))/g, en ? ',' : '.') + (frac ? (en ? '.' : ',') + frac : '')
    const signo = v < 0 ? '−' : ''
    const mon = moneda || window.moneda || localStorage.getItem('moneda') || '$'
    if (en) return signo + mon + num
    // Espacio que no se parte: el € nunca salta solo a la línea siguiente
    return mon === '€' ? signo + num + ' €' : signo + mon + num
  }

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const pad = n => String(n).padStart(2, '0')
  // Fecha local AAAA-MM-DD (toISOString usa UTC y de noche da el día equivocado)
  const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  // «🛒 Supermercado» → «Supermercado» y «🛒»
  const sinEmoji = c => String(c || '').replace(/^[^\p{L}\p{N}]+/u, '').trim()
  const emoji = (c, porDefecto = '📦') => (String(c || '').match(/^[^\p{L}\p{N}\s]+/u) || [porDefecto])[0].trim()

  // Librerías grandes que solo hacen falta a veces (Excel al importar, PDF de Préstamos): se descargan al usarlas.
  // cargarScript(url, () => window.X) → promesa con la librería; si falla, se puede volver a intentar
  const scripts = {}
  function cargarScript(url, lista) {
    if (lista()) return Promise.resolve(lista())
    if (!scripts[url]) scripts[url] = new Promise((ok, mal) => {
      const s = document.createElement('script')
      s.src = url
      s.onload = () => ok(lista())
      s.onerror = () => { delete scripts[url]; s.remove(); mal(new Error('sin conexión')) }
      document.head.appendChild(s)
    })
    return scripts[url]
  }

  window.MF = { CATS_DEFAULT, CATS_GASTO, dinero, esc, pad, fechaLocal, sinEmoji, emoji, cargarScript }
})()
