// ayuda.js — la ayuda de cada pantalla: al tocar «Ayuda» se ilumina cada parte y una burbuja explica qué es,
// en la misma pantalla. La descarga nav.js al tocar un botón con data-ayuda; los pasos de cada pantalla, en PANTALLAS.
// El foco es un hueco con una sombra enorme alrededor: sin desenfoques, va fluido en móviles sencillos.
;(function () {
  // el: selector, o lista de selectores (se ilumina el conjunto). Si no está en la pantalla, el paso se salta.
  const PANTALLAS = {
    inicio: [
      { el: '.period-bar', tit: 'El mes que estás viendo', txt: 'Todo lo de esta pantalla es de este mes. Con las flechas ves los meses anteriores.' },
      { el: ['#saldo-t', '#saldo-amount'], tit: 'Saldo actual', txt: 'Lo que te queda este mes: lo que te ha entrado menos lo que has gastado. No es lo que tienes en el banco, es la cuenta de este mes.',
        chips: [['#e6f0ea', 'En blanco: vas en positivo'], ['#f59e0b', 'En dorado: has gastado más de lo que te ha entrado']] },
      { el: '.spark-wrap', tit: 'Cómo acabó cada mes', txt: 'La línea es lo que te sobró (o te faltó) en cada uno de los últimos 6 meses. Si sube, vas a mejor.' },
      { el: '.pills-row > .pill:first-child', tit: 'Ingresos', txt: 'Todo el dinero que te ha entrado este mes: nómina, Bizum, ventas… Se apunta con el botón + → Ingreso.' },
      { el: '.pills-row > .pill:last-child', tit: 'Gastos', txt: 'Todo lo que has gastado este mes, gastos fijos incluidos.', nota: 'Toca la tarjeta y los ves uno a uno en Movimientos.' },
      { el: '.salud-card', tit: 'Salud financiera', txt: 'Qué parte de tus ingresos ya has gastado este mes. La rayita blanca de la barra marca por dónde vas.',
        chips: [['#10b981', 'Menos del 80 %: vas bien'], ['#f59e0b', '80–95 %: cuidado'], ['#ef4444', 'Más del 95 %: al límite']], nota: 'Tócala para hacer tu plan en Metas.' },
      { el: '.fijos-card', tit: 'Gastos fijos', txt: 'Lo que pagas todos los meses: alquiler, luz, gimnasio… Se cuentan solos, sin apuntarlos. Cada barra es la parte del total que se lleva ese gasto.',
        nota: 'Tócala para añadir o cambiar los tuyos.' },
      { el: '.mf-plus', redondo: true, tit: 'Apunta en un momento', txt: 'Con el botón + apuntas un gasto o un ingreso. Al guardarlo, Inicio se pone al día solo.' },
    ],
  }

  const PAD = 8    // aire alrededor de lo iluminado
  const GAP = 14   // entre el foco y la burbuja
  const MARGEN = 12

  const css = `
  .mfh { position: fixed; inset: 0; z-index: 450; color: #e5e7eb; font-family: Manrope, system-ui, sans-serif;
    padding: env(safe-area-inset-top, 0px) 0 env(safe-area-inset-bottom, 0px); touch-action: none; -webkit-tap-highlight-color: transparent;
    opacity: 0; transition: opacity .25s; }
  .mfh.mfh-ver { opacity: 1; }
  .mfh[hidden] { display: none; }
  .mfh-foco { position: absolute; left: 0; top: 0; border-radius: var(--r, 18px); pointer-events: none;
    box-shadow: 0 0 0 2px #34d399, 0 0 24px 2px rgba(16,185,129,.45), 0 0 0 150vmax rgba(5,8,16,.8);
    transition: transform .45s cubic-bezier(.16,1,.3,1), width .45s cubic-bezier(.16,1,.3,1), height .45s cubic-bezier(.16,1,.3,1); }
  .mfh-foco::after { content: ''; position: absolute; inset: -7px; border-radius: calc(var(--r, 18px) + 7px); border: 2px solid rgba(52,211,153,.6);
    animation: mfh-latido 1.3s ease-in-out infinite alternate; }
  .mfh-quieto .mfh-foco { transition: none; }
  /* El botón + se aparta mientras dura la ayuda (taparía lo iluminado), salvo cuando es él lo que se explica */
  .mfh-activa .mf-plus:not(.mfh-aqui) { opacity: 0; transform: translateY(24px) scale(.6); pointer-events: none; }
  .mfh-activa .mf-plus.mfh-aqui { opacity: 1; transform: none; transition: none; }
  .mfh-burbuja { position: absolute; left: 0; top: 0; width: min(400px, calc(100vw - ${2 * MARGEN}px)); padding: 14px 16px 14px 18px; border-radius: 20px;
    background: #131c2e; border: 1px solid rgba(52,211,153,.4); box-shadow: 0 22px 44px -14px rgba(0,0,0,.85);
    transition: opacity .2s, transform .3s cubic-bezier(.16,1,.3,1); }
  .mfh-burbuja.mfh-fuera { opacity: 0; transform: translateY(8px); }
  .mfh-arriba.mfh-fuera { transform: translateY(-8px); }
  .mfh-flecha { position: absolute; top: -8px; left: var(--x, 50%); width: 14px; height: 14px; margin-left: -7px; transform: rotate(45deg);
    background: #131c2e; border: 1px solid rgba(52,211,153,.4); border-right: 0; border-bottom: 0; border-radius: 3px 0 0 0; }
  .mfh-arriba .mfh-flecha { top: auto; bottom: -8px; border: 1px solid rgba(52,211,153,.4); border-left: 0; border-top: 0; border-radius: 0 0 3px 0; }
  .mfh-cab { display: flex; align-items: center; justify-content: space-between; margin: -2px -6px 6px 0; }
  .mfh-cuenta { font-size: 12px; font-weight: 800; color: #34d399; background: rgba(16,185,129,.14); padding: 4px 10px; border-radius: 999px; font-variant-numeric: tabular-nums; }
  .mfh-x { width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: #94a3b8; display: grid; place-items: center; cursor: pointer; }
  .mfh-x svg { width: 18px; height: 18px; }
  .mfh-tit { font-size: 19px; font-weight: 800; color: #fff; letter-spacing: -.01em; line-height: 1.2; }
  .mfh-txt { margin-top: 6px; font-size: 15px; line-height: 1.5; color: #cbd5e1; }
  .mfh-chips { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
  .mfh-chip { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #e5e7eb; }
  .mfh-chip i { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .mfh-nota { margin-top: 10px; font-size: 14px; font-weight: 700; color: #34d399; }
  .mfh-pie { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; }
  .mfh-atras { border: 0; background: none; color: #94a3b8; font: 700 15px Manrope, system-ui, sans-serif; padding: 10px 8px; margin-left: -8px; cursor: pointer; }
  .mfh-sig { border: 0; border-radius: 14px; padding: 12px 22px; font: 800 15px Manrope, system-ui, sans-serif; color: #fff; cursor: pointer;
    background: linear-gradient(110deg, #10b981, #14b8a6 60%, #6366f1); box-shadow: 0 10px 22px -10px rgba(16,185,129,.8); }
  .mfh-sig.mfh-mira { animation: mfh-mira .45s; }
  .mfh button:focus-visible { outline: 2px solid #a5b4fc; outline-offset: 2px; }
  @keyframes mfh-latido { from { opacity: .15; } to { opacity: 1; } }
  @keyframes mfh-mira { 30% { transform: scale(1.08); } 65% { transform: scale(.97); } }
  @media (prefers-reduced-motion: reduce) { .mfh, .mfh-foco, .mfh-burbuja { transition: none; } .mfh-foco::after { animation: none; } }`

  let raiz, foco, burbuja, cuenta, tit, txt, chips, nota, btnAtras, btnSig, observador
  let lista = [], i = 0, volver = null, tPaso, tAjuste, x0 = 0, y0 = 0
  const suave = () => !matchMedia('(prefers-reduced-motion: reduce)').matches

  function montar() {
    if (raiz) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    raiz = document.createElement('div')
    raiz.className = 'mfh'
    raiz.hidden = true
    raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', 'Ayuda de esta pantalla')
    raiz.innerHTML = `
      <div class="mfh-foco" aria-hidden="true"></div>
      <div class="mfh-burbuja mfh-fuera">
        <div class="mfh-cab"><span class="mfh-cuenta"></span>
          <button type="button" class="mfh-x" aria-label="Cerrar la ayuda"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
        <div aria-live="polite">
          <h2 class="mfh-tit"></h2>
          <p class="mfh-txt"></p>
          <div class="mfh-chips"></div>
          <p class="mfh-nota"></p>
        </div>
        <div class="mfh-pie">
          <button type="button" class="mfh-atras">Atrás</button>
          <button type="button" class="mfh-sig">Siguiente</button>
        </div>
        <i class="mfh-flecha" aria-hidden="true"></i>
      </div>`
    document.body.appendChild(raiz)
    const $ = s => raiz.querySelector(s)
    foco = $('.mfh-foco'); burbuja = $('.mfh-burbuja'); cuenta = $('.mfh-cuenta'); tit = $('.mfh-tit'); txt = $('.mfh-txt')
    chips = $('.mfh-chips'); nota = $('.mfh-nota'); btnAtras = $('.mfh-atras'); btnSig = $('.mfh-sig')

    btnSig.addEventListener('click', () => (i < lista.length - 1 ? ir(i + 1) : cerrar()))
    btnAtras.addEventListener('click', () => ir(i - 1))
    $('.mfh-x').addEventListener('click', cerrar)
    // Deslizar de lado también pasa de paso
    raiz.addEventListener('pointerdown', e => { x0 = e.clientX; y0 = e.clientY })
    raiz.addEventListener('pointerup', e => {
      const dx = e.clientX - x0, dy = e.clientY - y0
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? i + 1 : i - 1)
    })
    // Un toque fuera de la burbuja no abre nada de debajo: señala «Siguiente»
    raiz.addEventListener('click', e => {
      if (burbuja.contains(e.target)) return
      btnSig.classList.remove('mfh-mira'); void btnSig.offsetWidth; btnSig.classList.add('mfh-mira')
    })
    raiz.addEventListener('wheel', e => e.preventDefault(), { passive: false })
    observador = new ResizeObserver(ajustarLuego)
  }

  const elementos = p => [].concat(p.el).map(s => document.querySelector(s)).filter(e => e && e.getClientRects().length)
  // La caja que abarca los elementos del paso (null si no están en la pantalla)
  function caja(p) {
    const els = elementos(p)
    if (!els.length) return null
    const rs = els.map(e => e.getBoundingClientRect())
    return {
      top: Math.min(...rs.map(r => r.top)), bottom: Math.max(...rs.map(r => r.bottom)),
      left: Math.min(...rs.map(r => r.left)), right: Math.max(...rs.map(r => r.right)),
      fijo: getComputedStyle(els[0]).position === 'fixed',
    }
  }

  // Pone el foco sobre la parte del paso y la burbuja debajo (o encima si no cabe).
  // mover: desplaza la página lo justo para que se vean las dos.
  function colocar(mover) {
    const p = lista[i]
    if (!p) return
    document.querySelectorAll('.mfh-aqui').forEach(e => e.classList.remove('mfh-aqui'))
    elementos(p).forEach(e => e.classList.add('mfh-aqui'))
    const r = caja(p)
    if (!r) return
    const cs = getComputedStyle(raiz), vw = innerWidth, vh = innerHeight
    const arriba = MARGEN + parseFloat(cs.paddingTop)
    // Lo que se mueve con la página se señala por encima de la barra de abajo
    const barra = !r.fijo && document.querySelector('.mf-nav')
    const abajo = Math.min(vh - MARGEN - parseFloat(cs.paddingBottom), barra ? barra.getBoundingClientRect().top - 8 : Infinity)
    const bh = burbuja.offsetHeight, bw = burbuja.offsetWidth
    // Si lo iluminado no cabe junto a la burbuja, se ilumina su parte de arriba
    let h = Math.max(40, Math.min(r.bottom - r.top + 2 * PAD, abajo - arriba - bh - GAP))
    const y0 = r.top - PAD, max = document.scrollingElement.scrollHeight - vh
    // Cuánto mover la página para que se vea el bloque [desde, hasta] (lo fijo en pantalla no se mueve)
    const encaje = (desde, hasta) => {
      const quiero = !r.fijo && mover ? (desde < arriba ? desde - arriba : hasta > abajo ? hasta - abajo : 0) : 0
      const dy = Math.max(0, Math.min(max, scrollY + quiero)) - scrollY
      return { dy, cabe: desde - dy >= arriba - 1 && hasta - dy <= abajo + 1 }
    }
    // La burbuja va debajo; si al final de la página no cabe, encima
    const bajo = encaje(y0, y0 + h + GAP + bh), alto = encaje(y0 - GAP - bh, y0 + h)
    const debajo = bajo.cabe || !alto.cabe
    const { dy } = debajo ? bajo : alto
    const y = y0 - dy
    if (debajo) h = Math.max(40, Math.min(h, abajo - GAP - bh - y))
    if (dy) scrollTo({ top: scrollY + dy, behavior: suave() ? 'smooth' : 'auto' })
    const x = Math.max(4, r.left - PAD), w = Math.min(vw - 4, r.right + PAD) - x
    const bx = Math.max(MARGEN, Math.min(vw - MARGEN - bw, x + w / 2 - bw / 2))
    foco.style.cssText = `transform: translate(${x}px, ${y}px); width: ${w}px; height: ${h}px; --r: ${p.redondo ? '50%' : '18px'}`
    burbuja.style.left = bx + 'px'
    burbuja.style.top = (debajo ? y + h + GAP : y - GAP - bh) + 'px'
    burbuja.style.setProperty('--x', Math.max(24, Math.min(bw - 24, x + w / 2 - bx)) + 'px')
    burbuja.classList.toggle('mfh-arriba', !debajo)
  }

  function teclas(e) {
    if (e.key === 'Escape') cerrar()
    else if (e.key === 'ArrowRight') ir(i + 1)
    else if (e.key === 'ArrowLeft') ir(i - 1)
  }

  // Tras desplazar la página (o si algo cambia de tamaño), se vuelve a medir
  function ajustarLuego() { clearTimeout(tAjuste); tAjuste = setTimeout(() => colocar(false), 120) }
  const alGirar = () => colocar(true)

  function pintar() {
    const p = lista[i]
    cuenta.textContent = (i + 1) + ' de ' + lista.length
    tit.textContent = p.tit
    txt.textContent = p.txt
    chips.replaceChildren(...(p.chips || []).map(([color, texto]) => {
      const s = document.createElement('span'), punto = document.createElement('i')
      s.className = 'mfh-chip'; punto.style.background = color
      s.append(punto, texto)
      return s
    }))
    chips.hidden = !p.chips
    nota.textContent = p.nota || ''
    nota.hidden = !p.nota
    btnAtras.style.visibility = i ? '' : 'hidden'
    btnSig.textContent = i === lista.length - 1 ? 'Entendido' : 'Siguiente'
  }

  // Cambia de paso: la burbuja se apaga, cambia el texto (y su traducción) y aparece en el sitio nuevo
  function ir(n) {
    if (n < 0 || n >= lista.length || n === i) return
    i = n
    burbuja.classList.add('mfh-fuera')
    clearTimeout(tPaso)
    tPaso = setTimeout(() => {
      pintar()
      requestAnimationFrame(() => {
        colocar(true)
        burbuja.classList.remove('mfh-fuera')
        ajustarLuego()
      })
    }, 160)
  }

  function abrir(pantalla, boton) {
    const pasos = PANTALLAS[pantalla]
    if (!pasos || (raiz && raiz.classList.contains('mfh-ver'))) return
    montar()
    lista = pasos.filter(caja)
    if (!lista.length) return
    volver = boton || null
    i = 0
    pintar()
    raiz.hidden = false
    raiz.classList.add('mfh-quieto')
    document.documentElement.classList.add('mfh-activa')
    addEventListener('scroll', ajustarLuego, { passive: true })
    addEventListener('resize', alGirar)
    document.addEventListener('keydown', teclas)
    observador.observe(document.body)
    requestAnimationFrame(() => {
      colocar(true)
      raiz.classList.add('mfh-ver')
      burbuja.classList.remove('mfh-fuera')
      requestAnimationFrame(() => raiz.classList.remove('mfh-quieto'))
      btnSig.focus({ preventScroll: true })
    })
  }

  function cerrar() {
    if (!raiz || raiz.hidden) return
    clearTimeout(tPaso); clearTimeout(tAjuste)
    removeEventListener('scroll', ajustarLuego)
    removeEventListener('resize', alGirar)
    document.removeEventListener('keydown', teclas)
    observador.disconnect()
    raiz.classList.remove('mfh-ver')
    burbuja.classList.add('mfh-fuera')
    document.documentElement.classList.remove('mfh-activa')
    document.querySelectorAll('.mfh-aqui').forEach(e => e.classList.remove('mfh-aqui'))
    setTimeout(() => { if (!raiz.classList.contains('mfh-ver')) raiz.hidden = true }, 250)
    if (volver) volver.focus({ preventScroll: true })
  }

  window.MFAyuda = { abrir, cerrar }
})()
