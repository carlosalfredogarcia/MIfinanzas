// apunte.js — apunte rápido de un gasto desde cualquier pantalla (lo carga nav.js).
// El importe va primero con el teclado numérico abierto; debajo, los gastos recientes para
// repetirlos con un toque y las categorías más usadas. La descripción es opcional y, si
// coincide con un gasto anterior, elige su categoría. Al guardar no hay alerta: un aviso
// con "Deshacer" durante unos segundos.
// Todo se calcula en el navegador con los gastos de los últimos 90 días (sin IA).
;(function () {
  const CATS_DEFAULT = '🏠 Alquiler,💳 Crédito,📱 Línea,🏋️ Gym,⛽ Gasolina,💻 Tecnología,❤️ Salud,👕 Ropa,🎉 Salidas,🌍 Remesas,⚠️ Gastos Imprevistos,📋 Trámite,🚗 Vehículo,📦 Otros,🛒 Supermercado,💧 Agua,🧴 Cuidado personal,📺 Suscripción,💡 Luz,🌐 Internet'
  const TOP_CATS = 7
  // Funciones de recarga de cada pantalla, para que el gasto nuevo aparezca sin recargar la página
  const RECARGAS = ['cargarMovimientos', 'cargarDashboard', 'recargarDatos']

  const moneda = () => window.moneda || localStorage.getItem('moneda') || '€'
  const fmt = n => {
    const num = Number(n).toLocaleString('es-ES', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })
    return moneda() === '€' ? num + ' €' : moneda() + num
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const sinEmoji = c => c.replace(/^[^\p{L}\p{N}]+/u, '').trim()
  const emoji = c => (c.match(/^[^\p{L}\p{N}\s]+/u) || [''])[0]
  const importeTxt = n => (n % 1 ? n.toFixed(2) : String(n)).replace('.', ',')
  const parseImporte = v => parseFloat(String(v).replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))

  const css = `
  .mfa-fondo { position: fixed; inset: 0; z-index: 400; background: rgba(5,8,16,.62); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); opacity: 0; pointer-events: none; transition: opacity .2s; }
  .mfa-hoja { position: fixed; left: 0; right: 0; bottom: 0; z-index: 401; max-width: 480px; margin: 0 auto; max-height: 92vh; overflow-y: auto; overscroll-behavior: contain;
    background: #111827; border: 1px solid rgba(255,255,255,.08); border-bottom: 0; border-radius: 24px 24px 0 0; padding: 10px 18px calc(18px + env(safe-area-inset-bottom));
    font-family: Manrope, system-ui, sans-serif; color: #f1f5f9; transform: translateY(100%); visibility: hidden; transition: transform .26s cubic-bezier(.2,.8,.2,1), visibility 0s .26s; box-shadow: 0 -20px 50px rgba(0,0,0,.5); }
  .mfa-abierto .mfa-fondo { opacity: 1; pointer-events: auto; }
  .mfa-abierto .mfa-hoja { transform: none; visibility: visible; transition: transform .26s cubic-bezier(.2,.8,.2,1); }
  .mfa-asa { width: 40px; height: 4px; border-radius: 99px; background: #334155; margin: 0 auto 12px; }
  .mfa-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
  .mfa-tit { font-size: 15px; font-weight: 800; letter-spacing: -.01em; }
  .mfa-x { width: 34px; height: 34px; border-radius: 50%; border: 0; background: #1a2234; color: #94a3b8; font-size: 18px; cursor: pointer; display: grid; place-items: center; }
  .mfa-importe { display: flex; align-items: baseline; justify-content: center; gap: 6px; padding: 10px 0 6px; }
  .mfa-importe input { width: 1ch; min-width: 1ch; max-width: 8ch; background: none; border: 0; outline: none; color: #f1f5f9; font: 800 46px/1.1 Manrope, system-ui, sans-serif; text-align: center; font-variant-numeric: tabular-nums; letter-spacing: -.02em; caret-color: #f87171; padding: 0; }
  .mfa-importe input::placeholder { color: #334155; }
  .mfa-mon { font-size: 26px; font-weight: 800; color: #64748b; }
  .mfa-fechas { display: flex; justify-content: center; gap: 6px; margin-bottom: 14px; }
  .mfa-chip { flex: none; border: 1px solid #1f2937; background: #1a2234; color: #cbd5e1; border-radius: 999px; padding: 7px 12px; font: 700 12.5px Manrope, system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
  .mfa-chip[aria-pressed="true"] { background: rgba(239,68,68,.16); border-color: rgba(239,68,68,.55); color: #fecaca; }
  .mfa-fecha-otra { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; color-scheme: dark; }
  .mfa-lbl { font-size: 11px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin: 0 0 8px; }
  .mfa-recientes { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; margin: 0 -18px 14px; padding-left: 18px; padding-right: 18px; scrollbar-width: none; }
  .mfa-recientes::-webkit-scrollbar { display: none; }
  .mfa-rec { flex: none; display: flex; align-items: center; gap: 8px; border: 1px solid #1f2937; background: #0f1626; border-radius: 14px; padding: 8px 12px 8px 10px; cursor: pointer; color: #f1f5f9; font-family: inherit; text-align: left; }
  .mfa-rec b { display: block; font-size: 13px; font-weight: 700; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mfa-rec small { font-size: 12px; color: #94a3b8; font-variant-numeric: tabular-nums; }
  .mfa-rec .mfa-e { font-size: 20px; }
  .mfa-cats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .mfa-cat { border: 1px solid #1f2937; background: #0f1626; color: #cbd5e1; border-radius: 14px; padding: 9px 4px 8px; cursor: pointer; font: 700 11px Manrope, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
  .mfa-cat span:first-child { font-size: 22px; line-height: 1; }
  .mfa-cat span:last-child { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mfa-cat[aria-pressed="true"] { background: rgba(239,68,68,.14); border-color: #ef4444; color: #fff; }
  .mfa-nueva { margin: -4px 0 14px; padding: 12px; border: 1px solid #1f2937; border-radius: 16px; background: #0f1626; }
  .mfa-emojis { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; margin-bottom: 10px; }
  .mfa-emojis::-webkit-scrollbar { display: none; }
  .mfa-emojis button { flex: none; width: 38px; height: 38px; border-radius: 11px; border: 1px solid transparent; background: #1a2234; font-size: 19px; cursor: pointer; }
  .mfa-emojis button[aria-pressed="true"] { border-color: #ef4444; background: rgba(239,68,68,.14); }
  .mfa-nueva-fila { display: flex; gap: 8px; }
  .mfa-nueva-fila input { flex: 1; min-width: 0; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 11px 12px; color: #f1f5f9; font: 600 15px Manrope, system-ui, sans-serif; outline: none; }
  .mfa-nueva-fila button { flex: none; border: 0; border-radius: 12px; padding: 0 16px; background: #ef4444; color: #fff; font: 800 14px Manrope, system-ui, sans-serif; cursor: pointer; }
  .mfa-desc { width: 100%; box-sizing: border-box; background: #0f1626; border: 1px solid #1f2937; border-radius: 14px; padding: 13px 14px; color: #f1f5f9; font: 600 15px Manrope, system-ui, sans-serif; outline: none; }
  .mfa-desc:focus { border-color: #475569; }
  .mfa-sug { display: flex; gap: 6px; flex-wrap: wrap; min-height: 0; margin: 8px 0 0; }
  .mfa-guardar { width: 100%; margin-top: 14px; border: 0; border-radius: 16px; padding: 16px; font: 800 16px Manrope, system-ui, sans-serif; background: #ef4444; color: #fff; cursor: pointer; box-shadow: 0 10px 26px rgba(239,68,68,.32); transition: opacity .15s; }
  .mfa-guardar:disabled { opacity: .35; box-shadow: none; cursor: default; }
  .mfa-pie { display: flex; justify-content: center; margin-top: 10px; }
  .mfa-pegar { border: 0; background: none; color: #94a3b8; font: 700 13px Manrope, system-ui, sans-serif; cursor: pointer; padding: 6px 10px; }
  .mfa-toast { position: fixed; left: 50%; bottom: calc(110px + env(safe-area-inset-bottom)); z-index: 402; transform: translate(-50%, 20px); opacity: 0; pointer-events: none; transition: all .22s;
    display: flex; align-items: center; gap: 14px; white-space: nowrap; background: #1a2234; border: 1px solid #263248; border-radius: 14px; padding: 12px 14px 12px 16px; color: #f1f5f9; font: 700 14px Manrope, system-ui, sans-serif; box-shadow: 0 14px 30px rgba(0,0,0,.5); max-width: calc(100vw - 32px); }
  .mfa-toast.mfa-ver { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
  .mfa-toast button { border: 0; background: none; color: #a5b4fc; font: 800 14px Manrope, system-ui, sans-serif; cursor: pointer; padding: 4px; }
  `

  let raiz, hoja, inpImporte, inpDesc, btnGuardar, toastEl
  let estado = null      // { categoria, catManual, fecha }
  let datos = null       // { cats, top, recientes, porDesc }
  let guardando = false

  function montar() {
    if (raiz) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    raiz = document.createElement('div')
    raiz.innerHTML = `
      <div class="mfa-fondo" data-cerrar></div>
      <section class="mfa-hoja" role="dialog" aria-modal="true" aria-labelledby="mfa-tit">
        <div class="mfa-asa"></div>
        <div class="mfa-cab"><span class="mfa-tit" id="mfa-tit">Nuevo gasto</span><button type="button" class="mfa-x" data-cerrar aria-label="Cerrar">×</button></div>
        <label class="mfa-importe"><span class="mfa-mon" data-mon-pre></span><input id="mfa-importe" inputmode="decimal" autocomplete="off" placeholder="0" aria-label="Importe"><span class="mfa-mon" data-mon-post></span></label>
        <div class="mfa-fechas" role="group" aria-label="Fecha">
          <button type="button" class="mfa-chip" data-dia="0">Hoy</button>
          <button type="button" class="mfa-chip" data-dia="1">Ayer</button>
          <button type="button" class="mfa-chip" data-otra>📅 Otro día</button>
          <input type="date" class="mfa-fecha-otra" tabindex="-1" aria-hidden="true">
        </div>
        <div data-bloque-rec><p class="mfa-lbl">Repetir</p><div class="mfa-recientes" data-recientes></div></div>
        <p class="mfa-lbl">Categoría</p>
        <div class="mfa-cats" data-cats></div>
        <div class="mfa-nueva" data-nueva hidden>
          <div class="mfa-emojis" data-emojis></div>
          <div class="mfa-nueva-fila"><input data-nueva-nombre placeholder="Nombre de la categoría" maxlength="30" aria-label="Nombre de la nueva categoría"><button type="button" data-nueva-ok>Añadir</button></div>
        </div>
        <input class="mfa-desc" id="mfa-desc" placeholder="Descripción (opcional)" autocomplete="off" enterkeyhint="done" aria-label="Descripción">
        <div class="mfa-sug" data-sug></div>
        <button type="button" class="mfa-guardar" disabled>Guardar gasto</button>
        <div class="mfa-pie"><button type="button" class="mfa-pegar">📋 Pegar mensaje del banco</button></div>
      </section>
      <div class="mfa-toast" role="status" aria-live="polite"><span></span><button type="button">Deshacer</button></div>`
    document.body.appendChild(raiz)
    hoja = raiz.querySelector('.mfa-hoja')
    inpImporte = raiz.querySelector('#mfa-importe')
    inpDesc = raiz.querySelector('#mfa-desc')
    btnGuardar = raiz.querySelector('.mfa-guardar')
    toastEl = raiz.querySelector('.mfa-toast')

    raiz.querySelectorAll('[data-cerrar]').forEach(b => b.addEventListener('click', cerrar))
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && raiz.classList.contains('mfa-abierto')) cerrar() })
    inpImporte.addEventListener('input', () => {
      inpImporte.value = inpImporte.value.replace(/[^\d.,]/g, '')
      actualizarBoton()
    })
    inpImporte.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); listo() ? guardar() : inpDesc.focus() } })
    inpDesc.addEventListener('input', sugerir)
    inpDesc.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (listo()) guardar() } })
    raiz.querySelectorAll('[data-dia]').forEach(b => b.addEventListener('click', () => {
      const d = new Date(); d.setDate(d.getDate() - +b.dataset.dia); ponerFecha(fechaLocal(d))
    }))
    const otra = raiz.querySelector('.mfa-fecha-otra')
    otra.max = fechaLocal()
    otra.addEventListener('change', e => e.target.value && ponerFecha(e.target.value))
    raiz.querySelector('[data-otra]').addEventListener('click', () => {
      otra.value = estado.fecha
      try { otra.showPicker() } catch { otra.focus(); otra.click() }
    })
    btnGuardar.addEventListener('click', guardar)
    raiz.querySelector('[data-nueva-ok]').addEventListener('click', guardarNuevaCat)
    raiz.querySelector('[data-nueva-nombre]').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); guardarNuevaCat() } })
    raiz.querySelector('.mfa-pegar').addEventListener('click', pegarDelBanco)
  }

  function abrir() {
    montar()
    estado = { categoria: null, catManual: false, fecha: fechaLocal() }
    const pre = moneda() !== '€'
    raiz.querySelector('[data-mon-pre]').textContent = pre ? moneda() : ''
    raiz.querySelector('[data-mon-post]').textContent = pre ? '' : '€'
    inpImporte.value = ''; inpDesc.value = ''
    raiz.querySelector('[data-sug]').innerHTML = ''
    raiz.querySelector('[data-nueva]').hidden = true
    ponerFecha(estado.fecha)
    pintarCats(); pintarRecientes(); actualizarBoton()
    document.documentElement.style.overflow = 'hidden'
    clearTimeout(tCerrar); hoja.inert = false
    toastEl.classList.remove('mfa-ver')
    hoja.getBoundingClientRect()  // fija la posición de partida para que la animación se vea
    raiz.classList.add('mfa-abierto')
    // El foco en el mismo toque abre el teclado numérico en el móvil
    inpImporte.focus({ preventScroll: true })
    cargarDatos().then(() => { pintarCats(); pintarRecientes() })
  }

  let tCerrar
  function cerrar() {
    raiz.classList.remove('mfa-abierto')
    document.documentElement.style.overflow = ''
    inpImporte.blur(); inpDesc.blur()
    // Fuera de la pantalla no debe recibir foco ni toques
    tCerrar = setTimeout(() => { hoja.inert = true }, 280)
  }

  async function cargarDatos() {
    const uid = window.currentUserId
    if (!uid || !window.dbClient) return
    const desde = new Date(); desde.setDate(desde.getDate() - 90)
    const [{ data: gastos }, { data: perfil }] = await Promise.all([
      window.dbClient.from('gastos').select('descripcion, categoria, monto, fecha').eq('usuario_id', uid)
        .gte('fecha', fechaLocal(desde)).order('fecha', { ascending: false }).limit(400),
      window.dbClient.from('perfil').select('categorias').eq('usuario_id', uid).limit(1),
    ])
    const propias = (perfil?.[0]?.categorias || '').split(',').map(c => c.trim()).filter(Boolean)
    // La lista del perfil manda (en Perfil se pueden quitar); sin lista propia, la de siempre
    const cats = [...new Set(propias.length ? propias : CATS_DEFAULT.split(','))]
    const freq = {}, porDesc = new Map(), recientes = []
    for (const g of gastos || []) {
      if (!g.categoria) continue
      freq[g.categoria] = (freq[g.categoria] || 0) + 1
      const k = (g.descripcion || '').trim().toLowerCase()
      if (!k) continue
      if (!porDesc.has(k)) {
        porDesc.set(k, { descripcion: g.descripcion.trim(), categoria: g.categoria, monto: +g.monto, n: 0 })
        if (recientes.length < 8) recientes.push(porDesc.get(k))
      }
      porDesc.get(k).n++
    }
    if (!cats.includes('📦 Otros')) cats.push('📦 Otros')
    if (!propias.length) for (const c of Object.keys(freq)) if (!cats.includes(c)) cats.push(c)
    const top = [...cats].sort((a, b) => (freq[b] || 0) - (freq[a] || 0)).slice(0, TOP_CATS)
    datos = { cats, top, recientes, porDesc }
  }

  function pintarCats(todas) {
    const cont = raiz.querySelector('[data-cats]')
    const base = datos ? (todas ? datos.cats : datos.top) : CATS_DEFAULT.split(',').slice(0, TOP_CATS)
    const lista = [...base]
    if (estado.categoria && !lista.includes(estado.categoria)) lista.unshift(estado.categoria)
    cont.innerHTML = lista.map(c => `<button type="button" class="mfa-cat" data-cat="${esc(c)}" aria-pressed="${c === estado.categoria}"><span>${esc(emoji(c) || '•')}</span><span>${esc(sinEmoji(c))}</span></button>`).join('')
      + (!datos ? '' : todas
        ? `<button type="button" class="mfa-cat" data-nueva-cat><span>＋</span><span>Nueva</span></button>`
        : `<button type="button" class="mfa-cat" data-mas><span>⋯</span><span>Más</span></button>`)
    cont.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => {
      elegirCat(b.dataset.cat, true)
      if (!inpImporte.value) inpImporte.focus({ preventScroll: true })
    }))
    const mas = cont.querySelector('[data-mas]')
    if (mas) mas.addEventListener('click', () => pintarCats(true))
    const nueva = cont.querySelector('[data-nueva-cat]')
    if (nueva) nueva.addEventListener('click', abrirNuevaCat)
  }

  // ── Crear una categoría sin salir del apunte (se guarda en el perfil, como en Perfil) ──
  const EMOJIS = ['🏷️', '🍔', '☕', '🍺', '🐶', '👶', '🎁', '✈️', '🚌', '🚕', '💊', '💇', '🎮', '📚', '🎓', '🧹', '🔧', '🛋️', '💍', '⚽', '🎬', '🎵', '🏦', '💼']
  let emojiNueva = EMOJIS[0]
  function abrirNuevaCat() {
    const panel = raiz.querySelector('[data-nueva]')
    panel.hidden = false
    emojiNueva = EMOJIS[0]
    const fila = raiz.querySelector('[data-emojis]')
    fila.innerHTML = EMOJIS.map(e => `<button type="button" aria-pressed="${e === emojiNueva}" aria-label="${e}">${e}</button>`).join('')
    fila.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      emojiNueva = b.textContent
      fila.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)))
      raiz.querySelector('[data-nueva-nombre]').focus({ preventScroll: true })
    }))
    const inp = raiz.querySelector('[data-nueva-nombre]')
    inp.value = ''
    inp.focus({ preventScroll: true })
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  async function guardarNuevaCat() {
    const nombre = raiz.querySelector('[data-nueva-nombre]').value.trim().replace(/,/g, ' ')
    if (!nombre) { raiz.querySelector('[data-nueva-nombre]').focus(); return }
    const cat = `${emojiNueva} ${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}`
    if (datos.cats.some(c => sinEmoji(c).toLowerCase() === sinEmoji(cat).toLowerCase())) {
      elegirCat(datos.cats.find(c => sinEmoji(c).toLowerCase() === sinEmoji(cat).toLowerCase()), true)
      raiz.querySelector('[data-nueva]').hidden = true
      return
    }
    const uid = window.currentUserId
    const { data: filas } = await window.dbClient.from('perfil').select('id, categorias').eq('usuario_id', uid).limit(1)
    const fila = filas?.[0]
    // Mismo criterio que Perfil: si el usuario nunca personalizó, se parte de la lista por defecto
    const lista = (fila?.categorias || CATS_DEFAULT).split(',').map(c => c.trim()).filter(Boolean)
    lista.push(cat)
    const { error } = fila
      ? await window.dbClient.from('perfil').update({ categorias: lista.join(',') }).eq('id', fila.id)
      : await window.dbClient.from('perfil').insert({ usuario_id: uid, categorias: lista.join(',') })
    if (error) { aviso('No se pudo crear la categoría: ' + error.message); return }
    datos.cats.push(cat)
    raiz.querySelector('[data-nueva]').hidden = true
    elegirCat(cat, true)
    pintarCats(true)
    if (!inpImporte.value) inpImporte.focus({ preventScroll: true })
  }

  function elegirCat(cat, manual) {
    estado.categoria = cat
    if (manual) estado.catManual = true
    raiz.querySelectorAll('.mfa-cat[data-cat]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === cat)))
    if (!raiz.querySelector(`.mfa-cat[data-cat="${CSS.escape(cat)}"]`)) pintarCats(true)
    actualizarBoton()
  }

  function pintarRecientes() {
    const bloque = raiz.querySelector('[data-bloque-rec]')
    const lista = datos?.recientes || []
    bloque.hidden = !lista.length
    raiz.querySelector('[data-recientes]').innerHTML = lista.map((r, i) =>
      `<button type="button" class="mfa-rec" data-i="${i}"><span class="mfa-e">${esc(emoji(r.categoria) || '•')}</span><span><b>${esc(r.descripcion)}</b><small>${fmt(r.monto)}</small></span></button>`).join('')
    raiz.querySelectorAll('.mfa-rec').forEach(b => b.addEventListener('click', () => usar(lista[+b.dataset.i], true)))
  }

  // Rellena con un gasto anterior; el importe queda listo para cambiarlo si hace falta
  function usar(r, conImporte) {
    inpDesc.value = r.descripcion
    elegirCat(r.categoria, true)
    if (conImporte) {
      inpImporte.value = importeTxt(r.monto)
      inpImporte.focus({ preventScroll: true }); inpImporte.select()
    }
    raiz.querySelector('[data-sug]').innerHTML = ''
    actualizarBoton()
  }

  function sugerir() {
    const cont = raiz.querySelector('[data-sug]')
    const q = inpDesc.value.trim().toLowerCase()
    if (!datos || q.length < 2) { cont.innerHTML = ''; return }
    const exacto = datos.porDesc.get(q)
    if (exacto && !estado.catManual) elegirCat(exacto.categoria, false)
    const coinciden = [...datos.porDesc.values()].filter(r => r.descripcion.toLowerCase().includes(q) && r.descripcion.toLowerCase() !== q)
      .sort((a, b) => b.n - a.n).slice(0, 3)
    cont.innerHTML = coinciden.map((r, i) => `<button type="button" class="mfa-chip" data-i="${i}">${esc(emoji(r.categoria))} ${esc(r.descripcion)}</button>`).join('')
    cont.querySelectorAll('button').forEach(b => b.addEventListener('click', () => usar(coinciden[+b.dataset.i], !inpImporte.value)))
  }

  function ponerFecha(f) {
    estado.fecha = f
    const hoy = fechaLocal(), ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return fechaLocal(d) })()
    raiz.querySelector('[data-dia="0"]').setAttribute('aria-pressed', String(f === hoy))
    raiz.querySelector('[data-dia="1"]').setAttribute('aria-pressed', String(f === ayer))
    const otra = raiz.querySelector('[data-otra]'), esOtra = f !== hoy && f !== ayer
    otra.setAttribute('aria-pressed', String(esOtra))
    otra.textContent = esOtra ? '📅 ' + new Date(f + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : '📅 Otro día'
  }

  function ajustarAncho() { inpImporte.style.width = Math.max(1, inpImporte.value.length) + 'ch' }

  const listo = () => parseImporte(inpImporte.value) > 0 && !!estado.categoria
  function actualizarBoton() {
    ajustarAncho()
    btnGuardar.disabled = !listo() || guardando
    const n = parseImporte(inpImporte.value)
    btnGuardar.textContent = n > 0 ? `Guardar ${fmt(n)}` : 'Guardar gasto'
  }

  async function guardar() {
    if (!listo() || guardando) return
    guardando = true; actualizarBoton()
    const fila = {
      fecha: estado.fecha,
      descripcion: inpDesc.value.trim() || sinEmoji(estado.categoria),
      categoria: estado.categoria,
      monto: Math.round(parseImporte(inpImporte.value) * 100) / 100,
      usuario_id: window.currentUserId,
      origen: 'manual',
    }
    const { data, error } = await window.dbClient.from('gastos').insert([fila]).select('id')
    guardando = false
    if (error) { actualizarBoton(); aviso('No se pudo guardar: ' + error.message); return }
    if (navigator.vibrate) navigator.vibrate(12)
    cerrar()
    recargarPantalla()
    const id = data?.[0]?.id
    aviso(`${emoji(fila.categoria)} ${fmt(fila.monto)} guardado`, id ? async () => {
      await window.dbClient.from('gastos').delete().eq('id', id)
      recargarPantalla()
      aviso('Gasto eliminado')
    } : null)
    datos = null  // la próxima vez se recargan los recientes con este gasto
  }

  function recargarPantalla() {
    const fn = RECARGAS.find(f => typeof window[f] === 'function')
    if (fn) window[fn]()
  }

  let tAviso
  function aviso(texto, deshacer) {
    montar()
    toastEl.querySelector('span').textContent = texto
    const b = toastEl.querySelector('button')
    b.hidden = !deshacer
    b.onclick = deshacer ? () => { toastEl.classList.remove('mfa-ver'); deshacer() } : null
    toastEl.classList.add('mfa-ver')
    clearTimeout(tAviso)
    tAviso = setTimeout(() => toastEl.classList.remove('mfa-ver'), deshacer ? 5000 : 2500)
  }

  // "Compra con tarjeta en MERCADONA por 23,45 EUR el 12/10" → importe, comercio y fecha (sin IA)
  function leerMensajeBanco(txt) {
    const r = {}
    const imp = txt.match(/(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+[.,]\d{1,2}|\d+)\s*(?:€|eur(?:os)?\b)/i)
      || txt.match(/(?:€|eur)\s*(\d{1,3}(?:\.\d{3})*,\d{1,2}|\d+[.,]\d{1,2}|\d+)/i)
    if (imp) r.monto = parseImporte(imp[1])
    const com = txt.match(/\b(?:en|at)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9&'.\- ]{2,40}?)(?=\s+(?:el|por|con|a las|de|tarjeta)\b|\s*[,.;:]|\s*\d|\s*$)/i)
    const bizum = !com && txt.match(/bizum[^.]*?\ba\s+([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i)
    if (bizum) r.descripcion = 'Bizum ' + bizum[1]
    if (com) r.descripcion = com[1].trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|\s)\S/g, s => s.toUpperCase())
    const f = txt.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/)
    if (f && +f[2] >= 1 && +f[2] <= 12) {
      const y = f[3] ? (f[3].length === 2 ? '20' + f[3] : f[3]) : new Date().getFullYear()
      r.fecha = `${y}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}`
    }
    return r
  }

  async function pegarDelBanco() {
    let txt = ''
    try { txt = await navigator.clipboard.readText() } catch { /* sin permiso */ }
    if (!txt) { aviso('Copia el mensaje o la notificación del banco y vuelve a pulsar'); return }
    const r = leerMensajeBanco(txt)
    if (!r.monto && !r.descripcion) { aviso('No encontré un importe en el texto copiado'); return }
    if (r.monto) inpImporte.value = importeTxt(r.monto)
    if (r.fecha && r.fecha <= fechaLocal()) ponerFecha(r.fecha)
    if (r.descripcion) {
      inpDesc.value = r.descripcion
      const previo = datos && [...datos.porDesc.values()].find(p => p.descripcion.toLowerCase().includes(r.descripcion.toLowerCase().split(' ')[0]))
      if (previo) elegirCat(previo.categoria, false)
      sugerir()
    }
    actualizarBoton()
  }

  window.mfApunte = { abrir, leerMensajeBanco }
})()
