// nav.js — barra de navegación y botón + compartidos por todas las pantallas.
// Se carga al final del <body>. Sustituye la .navbar y el .fab propios de cada página
// y añade el menú de acciones rápidas (Gasto, Ingreso, Fijo, Importar CSV).
;(function () {
  const pagina = (location.pathname.split('/').pop() || 'inicio.html').replace('.html', '')
  const MOV = 'mifinanza-movimientos.html'

  // Pestaña activa: Inicio, Movimientos, Estadísticas o Más (el resto de pantallas viven en Más).
  const activa = pagina === 'inicio' ? 'inicio'
    : pagina === 'mifinanza-movimientos' ? 'movimientos'
    : pagina === 'mifinanza-estadisticas-v2' ? 'estadisticas'
    : 'mas'

  // Si la función existe en esta página se usa; si no, se abre Movimientos con esa acción.
  const local = (fn, accion) => () => (typeof window[fn] === 'function' ? window[fn]() : ir(accion))
  const ir = accion => { location.href = MOV + '?accion=' + accion }

  const ACCIONES = {
    gasto:   { label: 'Gasto',        color: '#f87171', fondo: 'rgba(239,68,68,.16)',  icono: '<path d="M12 5v14M19 12l-7 7-7-7"/>', run: local('abrirGasto', 'gasto') },
    ingreso: { label: 'Ingreso',      color: '#34d399', fondo: 'rgba(16,185,129,.16)', icono: '<path d="M12 19V5M5 12l7-7 7 7"/>', run: local('abrirIngreso', 'ingreso') },
    fijo:    { label: 'Gasto fijo',   color: '#a5b4fc', fondo: 'rgba(99,102,241,.18)', icono: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', run: local('abrirGastoFijo', 'fijo') },
    csv:     { label: 'Importar CSV', color: '#fbbf24', fondo: 'rgba(245,158,11,.16)', icono: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', run: local('abrirImportarCSV', 'csv') },
  }

  // Acción propia de cada pantalla, que antes hacía su botón +.
  const PROPIAS = {
    'mifinanza-metas':     { label: 'Nueva meta',     fn: 'abrirModal' },
    'mifinanza-prestamos': { label: 'Nuevo préstamo', fn: 'abrirModalNuevo' },
    'mifinanza-viajes':    { label: 'Nuevo viaje',    fn: 'abrirModalViaje' },
  }
  // En Gastos fijos, "Gasto fijo" abre el formulario de esa misma pantalla.
  if (pagina === 'mifinanza-fijos' && typeof window.abrirModal === 'function') ACCIONES.fijo.run = () => window.abrirModal()

  const ICONOS = {
    inicio: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
    movimientos: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    estadisticas: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    mas: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
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
  .mf-plus {
    flex: none; width: 56px; height: 56px; border-radius: 20px; cursor: pointer;
    display: grid; place-items: center; color: #34d399;
    background: rgba(17,24,39,.82); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(16,185,129,.4); box-shadow: 0 16px 36px rgba(0,0,0,.5);
    transition: transform .35s cubic-bezier(.16,1,.3,1), background .25s, color .25s; -webkit-tap-highlight-color: transparent;
  }
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
    bottom: calc(14px + 64px + 14px + env(safe-area-inset-bottom, 0px));
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
  @media (prefers-reduced-motion: reduce) {
    .mf-acc, .mf-plus, .mf-plus svg, .mf-velo, .mf-tab { transition: none; }
  }`

  function montar() {
    if (document.querySelector('.mf-bar')) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)

    const tab = (id, label, href) => id === 'mas'
      ? `<button type="button" class="mf-tab" data-mas ${activa === 'mas' ? 'aria-current="page"' : ''}>${svg(ICONOS.mas)}${label}</button>`
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
      <div class="mf-bar">
        <nav class="mf-nav" aria-label="Secciones">
          ${tab('inicio', 'Inicio', 'inicio.html')}
          ${tab('movimientos', 'Movim.', MOV)}
          ${tab('estadisticas', 'Estadíst.', 'mifinanza-estadisticas-v2.html')}
          ${tab('mas', 'Más')}
        </nav>
        <button type="button" class="mf-plus" aria-label="Añadir" aria-haspopup="menu" aria-expanded="false" aria-controls="mf-acciones">${svg('<path d="M12 5v14M5 12h14"/>', 2.6)}</button>
      </div>`
    document.body.appendChild(raiz)

    const plus = raiz.querySelector('.mf-plus')
    const botones = [...raiz.querySelectorAll('.mf-acc')]
    const abrir = si => {
      raiz.classList.toggle('mf-abierto', si)
      plus.setAttribute('aria-expanded', String(si))
      plus.setAttribute('aria-label', si ? 'Cerrar' : 'Añadir')
      botones.forEach(b => { b.tabIndex = si ? 0 : -1 })
      if (si) { if (navigator.vibrate) navigator.vibrate(8); botones[botones.length - 1].focus({ preventScroll: true }) }
    }
    plus.addEventListener('click', () => abrir(!raiz.classList.contains('mf-abierto')))
    raiz.querySelector('[data-cerrar]').addEventListener('click', () => abrir(false))
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && raiz.classList.contains('mf-abierto')) { abrir(false); plus.focus() } })
    botones.forEach(b => b.addEventListener('click', () => { abrir(false); items[+b.dataset.i].run() }))
    raiz.querySelector('[data-mas]').addEventListener('click', () => {
      if (typeof window.abrirPanelMas === 'function') window.abrirPanelMas()
    })
  }

  // Llegada desde otra pantalla con ?accion=gasto|ingreso|fijo|csv: se abre en cuanto hay sesión.
  function accionPendiente() {
    const accion = new URLSearchParams(location.search).get('accion')
    if (!accion || !ACCIONES[accion]) return
    history.replaceState(null, '', location.pathname)
    const fn = { gasto: 'abrirGasto', ingreso: 'abrirIngreso', fijo: 'abrirGastoFijo', csv: 'abrirImportarCSV' }[accion]
    let n = 0
    const iv = setInterval(() => {
      if (window.currentUserId && typeof window[fn] === 'function') { clearInterval(iv); window[fn]() }
      else if (++n > 100) clearInterval(iv)
    }, 50)
  }

  montar()
  accionPendiente()
})()
