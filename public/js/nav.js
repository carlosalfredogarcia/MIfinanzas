// nav.js — barra de navegación y botón + compartidos por todas las pantallas.
// Se carga al final del <body>. Sustituye la .navbar y el .fab propios de cada página
// y añade dos menús rápidos que no se confunden entre sí:
//  - el botón + (flota sobre la barra, a la derecha; abre una columna de botones): Gasto, Ingreso, Gasto fijo, Importar CSV;
//    "Gasto" abre el apunte rápido (apunte.js) en la misma pantalla;
//  - la pestaña Menú (panel de casillas sobre la barra): Metas, Gastos fijos, Préstamos, Perfil.
;(function () {
  const pagina = (location.pathname.split('/').pop() || 'inicio.html').replace('.html', '')
  const MOV = 'mifinanza-movimientos.html'

  // Pestaña activa: Inicio, Movimientos, Estadísticas o Menú (el resto de pantallas viven en Menú).
  const activa = pagina === 'inicio' ? 'inicio'
    : pagina === 'mifinanza-movimientos' ? 'movimientos'
    : pagina === 'mifinanza-estadisticas-v2' ? 'estadisticas'
    : 'menu'

  // Apunte rápido de gastos (apunte.js): se abre encima de cualquier pantalla, sin cambiar de página
  if (!window.mfApunte) {
    const s = document.createElement('script')
    s.src = 'js/apunte.js'
    document.head.appendChild(s)
  }

  // Si la función existe en esta página se usa; si no, se abre Movimientos con esa acción.
  const local = (fn, accion) => () => (typeof window[fn] === 'function' ? window[fn]() : ir(accion))
  const ir = (accion, pagina = MOV) => { location.href = pagina + '?accion=' + accion }
  // Gasto e ingreso: la hoja rápida, encima de la pantalla en la que estés
  const apunte = tipo => () => (window.mfApunte ? window.mfApunte.abrir(tipo) : ir(tipo))
  const FIJOS = 'mifinanza-fijos.html'

  const ACCIONES = {
    gasto:   { label: 'Gasto',        color: '#f87171', fondo: 'rgba(239,68,68,.16)',  icono: '<path d="M12 5v14M19 12l-7 7-7-7"/>', run: apunte('gasto') },
    ingreso: { label: 'Ingreso',      color: '#34d399', fondo: 'rgba(16,185,129,.16)', icono: '<path d="M12 19V5M5 12l7-7 7 7"/>', run: apunte('ingreso') },
    fijo:    { label: 'Gasto fijo',   color: '#a5b4fc', fondo: 'rgba(99,102,241,.18)', icono: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', run: () => ir('fijo', FIJOS) },
    csv:     { label: 'Importar CSV', color: '#fbbf24', fondo: 'rgba(245,158,11,.16)', icono: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', run: local('abrirImportarCSV', 'csv') },
  }

  // Acción propia de cada pantalla, que antes hacía su botón +.
  const PROPIAS = {
    'mifinanza-metas':     { label: 'Nueva meta',     fn: 'abrirModal' },
    'mifinanza-prestamos': { label: 'Nuevo préstamo', fn: 'abrirModalNuevo' },
    'mifinanza-viajes':    { label: 'Nuevo viaje',    fn: 'abrirModalViaje' },
  }
  // Gasto fijo: su hoja vive en Gastos fijos (desde otra pantalla se va allí y se abre sola)
  if (pagina === 'mifinanza-fijos' && typeof window.abrirModal === 'function') ACCIONES.fijo.run = () => window.abrirModal()

  // Pantallas del Menú (Viajes sigue oculto, como en el panel antiguo).
  const SECCIONES = [
    { label: 'Metas', href: 'mifinanza-metas.html', icono: 'metas' },
    { label: 'Gastos fijos', href: 'mifinanza-fijos.html', icono: 'fijos' },
    { label: 'Préstamos', href: 'mifinanza-prestamos.html', icono: 'prestamos' },
    { label: 'Perfil', href: 'mifinanza-perfil.html', icono: 'perfil' },
  ]

  const ICONOS = {
    inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    movimientos: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    estadisticas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    menu: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    metas: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    fijos: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    prestamos: '<path d="M7 10h13l-4-4M17 14H4l4 4"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    estrella: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z"/>',
    papelera: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  }
  const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`

  const css = `
  .navbar, .fab { display: none !important; }
  .mf-bar {
    position: fixed; z-index: 150; left: 0; right: 0; bottom: 0;
    display: flex; gap: 8px; align-items: center; justify-content: center;
    padding: 0 max(12px, env(safe-area-inset-right, 0px)) calc(14px + env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px));
    pointer-events: none; font-family: Manrope, 'DM Sans', system-ui, sans-serif;
  }
  .mf-bar > * { pointer-events: auto; }
  .mf-nav {
    flex: 1; max-width: 400px; height: 64px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
    align-items: center; padding: 0 6px; border-radius: 24px;
    background: rgba(17,24,39,.82); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,.08); box-shadow: 0 16px 36px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.06);
  }
  .mf-tab {
    justify-self: center; width: 100%; max-width: 76px; height: 52px; border-radius: 18px; border: 0; background: none;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
    color: #94a3b8; font: 700 11px/1 Manrope, 'DM Sans', system-ui, sans-serif; text-decoration: none; cursor: pointer;
    transition: background .25s, color .25s; -webkit-tap-highlight-color: transparent;
  }
  .mf-tab svg { width: 22px; height: 22px; }
  .mf-tab[aria-current="page"] { background: rgba(16,185,129,.16); color: #34d399; font-weight: 800; }
  .mf-tab:focus-visible, .mf-plus:focus-visible, .mf-acc:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 2px; }
  body { padding-bottom: calc(170px + env(safe-area-inset-bottom, 0px)); }
  .mf-plus {
    position: fixed; z-index: 152; right: max(16px, env(safe-area-inset-right, 0px));
    bottom: calc(14px + 64px + 14px + env(safe-area-inset-bottom, 0px));
    width: 56px; height: 56px; border-radius: 50%; cursor: pointer;
    display: grid; place-items: center; color: #34d399;
    background: rgba(17,24,39,.85); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(16,185,129,.45); box-shadow: 0 14px 32px rgba(0,0,0,.5), 0 0 0 5px rgba(16,185,129,.08);
    transition: transform .35s cubic-bezier(.16,1,.3,1), opacity .25s, background .25s, color .25s; -webkit-tap-highlight-color: transparent;
  }
  /* Al bajar por la pantalla el + se aparta para no tapar contenido; vuelve al subir. */
  .mf-plus.mf-oculto { transform: translateY(24px) scale(.6); opacity: 0; pointer-events: none; }
  .mf-plus svg { width: 26px; height: 26px; transition: transform .35s cubic-bezier(.16,1,.3,1); }
  .mf-abierto .mf-plus { background: #1f2937; color: #e5e7eb; border-color: rgba(255,255,255,.12); }
  .mf-abierto .mf-plus svg { transform: rotate(45deg); }
  .mf-velo {
    position: fixed; inset: 0; z-index: 140; background: rgba(5,8,16,.6);
    backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    opacity: 0; pointer-events: none; transition: opacity .25s;
  }
  .mf-abierto .mf-velo { opacity: 1; pointer-events: auto; }
  .mf-acciones {
    position: fixed; z-index: 151; right: max(12px, env(safe-area-inset-right, 0px));
    bottom: calc(14px + 64px + 14px + 56px + 14px + env(safe-area-inset-bottom, 0px));
    display: flex; flex-direction: column; align-items: flex-end; gap: 10px; pointer-events: none;
    font-family: Manrope, 'DM Sans', system-ui, sans-serif;
  }
  .mf-acc {
    display: flex; align-items: center; gap: 12px; border: 0; background: none; padding: 0; cursor: pointer;
    opacity: 0; transform: translateY(14px) scale(.96);
    transition: opacity .25s, transform .4s cubic-bezier(.16,1,.3,1); -webkit-tap-highlight-color: transparent;
  }
  .mf-abierto .mf-acciones { pointer-events: auto; }
  .mf-abierto .mf-acc { opacity: 1; transform: none; }
  .mf-acc-txt { font-size: 15px; font-weight: 800; color: #f1f5f9; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
  .mf-acc-ico {
    width: 56px; height: 56px; border-radius: 18px; display: grid; place-items: center;
    backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 10px 24px rgba(0,0,0,.45);
  }
  .mf-acc-ico svg { width: 24px; height: 24px; }
  .mf-acc.mf-peligro .mf-acc-txt { color: #fca5a5; font-size: 13px; font-weight: 700; }
  .mf-acc.mf-peligro .mf-acc-ico { width: 44px; height: 44px; border-radius: 14px; margin-right: 6px; }
  .mf-menu {
    position: fixed; z-index: 151; left: max(12px, env(safe-area-inset-left, 0px)); right: max(12px, env(safe-area-inset-right, 0px));
    bottom: calc(14px + 64px + 12px + env(safe-area-inset-bottom, 0px));
    max-width: 400px; margin: 0 auto; padding: 14px; border-radius: 24px;
    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
    background: rgba(17,24,39,.9); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255,255,255,.1); box-shadow: 0 20px 44px rgba(0,0,0,.55);
    font-family: Manrope, 'DM Sans', system-ui, sans-serif;
    opacity: 0; transform: translateY(16px) scale(.97); transform-origin: 88% 100%; pointer-events: none;
    transition: opacity .25s, transform .4s cubic-bezier(.16,1,.3,1);
  }
  .mf-menu-titulo { grid-column: 1 / -1; font-size: 11px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: #94a3b8; padding: 2px 4px 0; }
  .mf-casilla {
    display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 14px; min-height: 92px;
    border-radius: 18px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
    color: #e5e7eb; font-size: 14px; font-weight: 800; text-decoration: none; -webkit-tap-highlight-color: transparent;
    transition: background .2s, border-color .2s;
  }
  .mf-casilla:hover { background: rgba(99,102,241,.12); border-color: rgba(99,102,241,.35); }
  .mf-casilla[aria-current="page"] { background: rgba(16,185,129,.12); border-color: rgba(16,185,129,.4); }
  .mf-casilla:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 2px; }
  .mf-casilla-ico { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: rgba(99,102,241,.16); color: #a5b4fc; }
  .mf-casilla[aria-current="page"] .mf-casilla-ico { background: rgba(16,185,129,.16); color: #34d399; }
  .mf-casilla-ico svg { width: 22px; height: 22px; }
  .mf-menu-abierto .mf-velo { opacity: 1; pointer-events: auto; }
  .mf-menu-abierto .mf-menu { opacity: 1; transform: none; pointer-events: auto; }
  .mf-menu-abierto .mf-tab[data-menu] { background: rgba(99,102,241,.2); color: #c7d2fe; }
  @media (prefers-reduced-motion: reduce) {
    .mf-acc, .mf-plus, .mf-plus svg, .mf-velo, .mf-tab, .mf-menu { transition: none; }
  }`

  function montar() {
    if (document.querySelector('.mf-bar')) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)

    const tab = (id, label, href) => id === 'menu'
      ? `<button type="button" class="mf-tab" data-menu aria-haspopup="true" aria-expanded="false" aria-controls="mf-menu" ${activa === 'menu' ? 'aria-current="page"' : ''}>${svg(ICONOS.menu)}${label}</button>`
      : `<a class="mf-tab" href="${href}" ${activa === id ? 'aria-current="page"' : ''}>${svg(ICONOS[id])}${label}</a>`

    const propia = PROPIAS[pagina] && typeof window[PROPIAS[pagina].fn] === 'function' ? PROPIAS[pagina] : null
    const items = []
    if (propia) items.push({ label: propia.label, color: '#e5e7eb', fondo: 'rgba(255,255,255,.10)', icono: ICONOS.estrella, run: () => window[propia.fn]() })
    items.push(ACCIONES.gasto, ACCIONES.ingreso, ACCIONES.fijo, ACCIONES.csv)
    if (pagina === 'mifinanza-movimientos' && typeof window.abrirBorrarTodo === 'function') {
      items.push({ label: 'Eliminar todo', color: '#f87171', fondo: 'rgba(239,68,68,.10)', icono: ICONOS.papelera, run: () => window.abrirBorrarTodo(), peligro: true })
    }

    const raiz = document.createElement('div')
    raiz.className = 'mf-raiz'
    raiz.innerHTML = `
      <div class="mf-velo" data-cerrar></div>
      <div class="mf-acciones" id="mf-acciones" role="menu" aria-label="Añadir">
        ${items.map((a, i) => `
          <button type="button" role="menuitem" tabindex="-1" class="mf-acc${a.peligro ? ' mf-peligro' : ''}" data-i="${i}"
            style="transition-delay:${(items.length - 1 - i) * 35}ms">
            <span class="mf-acc-txt">${a.label}</span>
            <span class="mf-acc-ico" style="background:${a.fondo};border:1px solid ${a.color}55;color:${a.color}">${svg(a.icono, 2.2)}</span>
          </button>`).join('')}
      </div>
      <div class="mf-menu" id="mf-menu" aria-label="Menú">
        <div class="mf-menu-titulo">Menú</div>
        ${SECCIONES.map(x => `<a class="mf-casilla" href="${x.href}" tabindex="-1" ${pagina + '.html' === x.href ? 'aria-current="page"' : ''}>
          <span class="mf-casilla-ico">${svg(ICONOS[x.icono])}</span>${x.label}</a>`).join('')}
      </div>
      <div class="mf-bar">
        <nav class="mf-nav" aria-label="Secciones">
          ${tab('inicio', 'Inicio', 'inicio.html')}
          ${tab('movimientos', 'Movim.', MOV)}
          ${tab('estadisticas', 'Estadíst.', 'mifinanza-estadisticas-v2.html')}
          ${tab('menu', 'Menú')}
        </nav>
      </div>
      <button type="button" class="mf-plus" aria-label="Añadir" aria-haspopup="menu" aria-expanded="false" aria-controls="mf-acciones">${svg('<path d="M12 5v14M5 12h14"/>', 2.6)}</button>`
    document.body.appendChild(raiz)

    const plus = raiz.querySelector('.mf-plus')
    const tabMenu = raiz.querySelector('[data-menu]')
    const botones = [...raiz.querySelectorAll('.mf-acc')]
    const casillas = [...raiz.querySelectorAll('.mf-casilla')]
    // Solo un menú abierto a la vez: 'mas' (botón +), 'menu' (pestaña Menú) o null.
    let abierto = null
    const abrir = cual => {
      abierto = cual
      raiz.classList.toggle('mf-abierto', cual === 'mas')
      raiz.classList.toggle('mf-menu-abierto', cual === 'menu')
      plus.setAttribute('aria-expanded', String(cual === 'mas'))
      plus.setAttribute('aria-label', cual === 'mas' ? 'Cerrar' : 'Añadir')
      tabMenu.setAttribute('aria-expanded', String(cual === 'menu'))
      plus.classList.toggle('mf-oculto', cual === 'menu')  // con el Menú abierto el + taparía una casilla
      botones.forEach(b => { b.tabIndex = cual === 'mas' ? 0 : -1 })
      casillas.forEach(c => { c.tabIndex = cual === 'menu' ? 0 : -1 })
      if (cual && navigator.vibrate) navigator.vibrate(8)
      if (cual === 'mas') botones[botones.length - 1].focus({ preventScroll: true })
      if (cual === 'menu') casillas[0].focus({ preventScroll: true })
    }
    plus.addEventListener('click', () => abrir(abierto === 'mas' ? null : 'mas'))
    tabMenu.addEventListener('click', () => abrir(abierto === 'menu' ? null : 'menu'))
    raiz.querySelector('[data-cerrar]').addEventListener('click', () => abrir(null))
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !abierto) return
      const volver = abierto === 'mas' ? plus : tabMenu
      abrir(null); volver.focus()
    })
    botones.forEach(b => b.addEventListener('click', () => { abrir(null); items[+b.dataset.i].run() }))

    let ultimoY = window.scrollY
    window.addEventListener('scroll', () => {
      const y = window.scrollY
      if (Math.abs(y - ultimoY) < 8) return
      plus.classList.toggle('mf-oculto', y > ultimoY && y > 80 && !abierto)
      ultimoY = y
    }, { passive: true })
  }

  // Llegada con ?accion=gasto|ingreso|fijo|csv: se abre en cuanto hay sesión.
  // Gasto e ingreso aceptan datos para abrirse ya rellenos (accesos directos del móvil, compartir):
  //   ?accion=gasto&importe=12,50&comercio=Mercadona&fecha=2026-10-21   o   ?texto=<mensaje del banco>
  // Con &guardar=1 se guarda solo (MacroDroid al llegar la notificación del banco), con «Deshacer».
  function accionPendiente() {
    const q = new URLSearchParams(location.search)
    const titulo = q.get('titulo') || ''
    const texto = q.get('texto') || titulo
    const accion = q.get('accion') || (texto ? 'gasto' : '')
    if (!accion || !ACCIONES[accion]) return
    if (accion === 'fijo' && pagina !== 'mifinanza-fijos') return ir('fijo', FIJOS)
    history.replaceState(null, '', location.pathname)
    const relleno = { monto: parseFloat(String(q.get('importe') || '').replace(',', '.')) || undefined, descripcion: q.get('comercio') || undefined, fecha: q.get('fecha') || undefined, texto: texto || undefined, titulo: titulo || undefined, guardar: q.get('guardar') === '1' }
    const fn = { fijo: 'abrirModal', csv: 'abrirImportarCSV' }[accion]
    // Un aviso del banco decide si es gasto o ingreso («Bizum recibido» → ingreso)
    const tipo = () => !q.get('accion') && texto ? window.mfApunte.leerMensajeBanco(texto, titulo).tipo : accion
    const lista = () => accion === 'gasto' || accion === 'ingreso' ? window.mfApunte && (() => window.mfApunte.abrir(tipo(), relleno)) : window[fn]
    let n = 0
    const iv = setInterval(() => {
      if (window.currentUserId && typeof lista() === 'function') { clearInterval(iv); lista()() }
      else if (++n > 100) clearInterval(iv)
    }, 50)
  }

  montar()
  accionPendiente()
})()
