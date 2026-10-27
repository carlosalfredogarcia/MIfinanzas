// guia.js — guía de bienvenida: qué es cada parte de MiFinanza, paso a paso y deslizando de lado.
// La carga nav.js. Sale sola la primera vez en Inicio (localStorage «guiaVista») y desde Perfil → Guía.
// Usa las capturas reales de img/landing/. Sin desenfoques ni efectos pesados.
;(function () {
  const PASOS = [
    { img: null, emoji: '👋', tit: 'Bienvenido a MiFinanza', txt: 'Te enseño lo importante en un minuto. Desliza para seguir →' },
    { img: 'apuntar', emoji: '➕', tit: 'Apunta un gasto en 3 toques', txt: 'Toca el botón + de abajo, escribe el importe y elige la categoría. Tus gastos de siempre se repiten con un toque.', nota: '¿Te equivocaste? Toca «Deshacer».' },
    { img: 'importar', emoji: '🏦', tit: 'O importa tu banco', txt: 'En Movimientos, sube el extracto de tu banco (CSV o Excel). La app clasifica cada movimiento y tú solo revisas y guardas.' },
    { img: 'inicio', emoji: '🏠', tit: 'Tu mes de un vistazo', txt: 'Arriba, lo que te queda este mes. Abajo, tu salud financiera: qué parte de tus ingresos ya has gastado.',
      chips: [['#10b981', 'Menos del 80 %: vas bien'], ['#f59e0b', '80–95 %: cuidado'], ['#ef4444', 'Más del 95 %: al límite']] },
    { img: 'estadisticas', emoji: '📊', tit: 'Mira a dónde se va tu dinero', txt: 'En Estadísticas ves cuánto se va en cada categoría: por mes, por período o el año entero.' },
    { img: 'recortar', emoji: '✂️', tit: 'Recorta y avanza', txt: 'En Metas haces tu plan en 4 pasos. Baja los gastos variables (salidas, compras, caprichos) con − / + y mira al momento cuánto ahorras.', nota: 'Cambia y reduce: disfruta y avanza.' },
    { img: 'fijos', emoji: '🔁', tit: 'Los gastos fijos, sin apuntarlos', txt: 'Alquiler, luz, gimnasio… Añádelos una vez en Gastos fijos y se cuentan solos cada mes. Te avisa antes de cada cobro.' },
    { img: null, emoji: '✅', tit: '¡Listo!', txt: 'Empieza por lo más fácil: apunta tu primer gasto. Puedes volver a ver esta guía cuando quieras en Perfil.', fin: true },
  ]

  const css = `
  .mfg { position: fixed; inset: 0; z-index: 500; display: flex; flex-direction: column; color: #e5e7eb; font-family: Manrope, system-ui, sans-serif;
    background: radial-gradient(circle at 15% 0%, rgba(16,185,129,.22), transparent 50%), radial-gradient(circle at 100% 85%, rgba(99,102,241,.28), transparent 55%), #0a0e1a;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); opacity: 0; transition: opacity .3s; }
  .mfg.mfg-ver { opacity: 1; }
  .mfg-cab { display: flex; justify-content: flex-end; padding: 12px 16px 0; }
  .mfg-saltar { border: 0; background: rgba(255,255,255,.06); color: #94a3b8; font: 700 14px Manrope, system-ui, sans-serif; padding: 9px 14px; border-radius: 12px; cursor: pointer; }
  .mfg-pasos { flex: 1; min-height: 0; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
  .mfg-pasos::-webkit-scrollbar { display: none; }
  .mfg-paso { flex: 0 0 100%; scroll-snap-align: center; scroll-snap-stop: always; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 8px 24px; text-align: center; min-height: 0; }
  .mfg-movil { flex: 0 1 auto; height: min(46vh, 430px); aspect-ratio: 390 / 600; border-radius: 30px; padding: 7px; background: linear-gradient(150deg, #3a4357, #0d121d);
    box-shadow: 0 24px 40px -18px rgba(0,0,0,.8), 0 0 0 1px rgba(255,255,255,.08); overflow: hidden; }
  .mfg-movil img { width: 100%; height: 100%; object-fit: cover; object-position: top; border-radius: 24px; display: block; }
  .mfg-logo { width: 96px; height: 96px; border-radius: 28px; box-shadow: 0 16px 40px -10px rgba(16,185,129,.6); }
  .mfg-gran { font-size: 72px; line-height: 1; }
  .mfg-tit { font-size: clamp(24px, 6.4vw, 30px); font-weight: 800; line-height: 1.15; color: #fff; letter-spacing: -.02em; }
  .mfg-tit span { display: block; font-size: 30px; margin-bottom: 6px; }
  .mfg-txt { font-size: 16px; line-height: 1.5; color: #cbd5e1; max-width: 420px; margin-top: -6px; }
  .mfg-nota { font-size: 14px; font-weight: 700; color: #34d399; }
  .mfg-chips { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .mfg-chip { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: #e5e7eb; }
  .mfg-chip i { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .mfg-pie { padding: 10px 24px 22px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .mfg-puntos { display: flex; gap: 7px; }
  .mfg-puntos i { width: 7px; height: 7px; border-radius: 4px; background: rgba(255,255,255,.2); transition: width .3s, background .3s; }
  .mfg-puntos i.on { width: 22px; background: #34d399; }
  .mfg-sig { width: 100%; max-width: 420px; border: 0; border-radius: 16px; padding: 16px; font: 800 16px Manrope, system-ui, sans-serif; color: #fff; cursor: pointer;
    background: linear-gradient(110deg, #10b981, #14b8a6, #6366f1); box-shadow: 0 12px 28px -10px rgba(16,185,129,.7); }
  .mfg-luego { border: 0; background: none; color: #94a3b8; font: 700 14px Manrope, system-ui, sans-serif; cursor: pointer; padding: 4px; }
  @media (max-height: 640px) { .mfg-movil { height: 38vh; } .mfg-txt { font-size: 15px; } }
  @media (prefers-reduced-motion: reduce) { .mfg { transition: none; } }`

  let raiz, pasos, puntos, btnSig, btnLuego, actual = 0

  function montar() {
    if (raiz) return
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st)
    raiz = document.createElement('div')
    raiz.className = 'mfg'
    raiz.setAttribute('role', 'dialog'); raiz.setAttribute('aria-modal', 'true'); raiz.setAttribute('aria-label', 'Guía de MiFinanza')
    raiz.innerHTML = `
      <div class="mfg-cab"><button type="button" class="mfg-saltar">Saltar</button></div>
      <div class="mfg-pasos" tabindex="0">${PASOS.map((p, i) => `
        <section class="mfg-paso" aria-roledescription="paso" aria-label="Paso ${i + 1} de ${PASOS.length}">
          ${p.img ? `<div class="mfg-movil"><img src="img/landing/${p.img}.webp" alt="" ${i > 1 ? 'loading="lazy"' : ''}></div>`
            : i === 0 ? '<img class="mfg-logo" src="/icon.svg" alt="">' : `<div class="mfg-gran" aria-hidden="true">${p.emoji}</div>`}
          <h2 class="mfg-tit">${p.img ? `<span aria-hidden="true">${p.emoji}</span>` : ''}${p.tit}</h2>
          <p class="mfg-txt">${p.txt}</p>
          ${p.chips ? `<div class="mfg-chips">${p.chips.map(([c, t]) => `<span class="mfg-chip"><i style="background:${c}"></i>${t}</span>`).join('')}</div>` : ''}
          ${p.nota ? `<p class="mfg-nota">${p.nota}</p>` : ''}
        </section>`).join('')}
      </div>
      <div class="mfg-pie">
        <div class="mfg-puntos" aria-hidden="true">${PASOS.map(() => '<i></i>').join('')}</div>
        <button type="button" class="mfg-sig">Siguiente</button>
        <button type="button" class="mfg-luego" hidden>Ahora no</button>
      </div>`
    document.body.appendChild(raiz)
    pasos = raiz.querySelector('.mfg-pasos')
    puntos = [...raiz.querySelectorAll('.mfg-puntos i')]
    btnSig = raiz.querySelector('.mfg-sig')
    btnLuego = raiz.querySelector('.mfg-luego')

    raiz.querySelector('.mfg-saltar').addEventListener('click', cerrar)
    btnLuego.addEventListener('click', cerrar)
    btnSig.addEventListener('click', () => {
      if (actual < PASOS.length - 1) return ir(actual + 1)
      cerrar()
      if (window.mfApunte) window.mfApunte.abrir('gasto')
    })
    pasos.addEventListener('scroll', () => requestAnimationFrame(pintar), { passive: true })
    raiz.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') ir(actual + 1)
      else if (e.key === 'ArrowLeft') ir(actual - 1)
      else if (e.key === 'Escape') cerrar()
    })
  }

  const ir = i => pasos.scrollTo({ left: Math.max(0, Math.min(PASOS.length - 1, i)) * pasos.clientWidth, behavior: 'smooth' })

  function pintar() {
    actual = Math.round(pasos.scrollLeft / pasos.clientWidth)
    puntos.forEach((p, k) => p.classList.toggle('on', k === actual))
    const fin = actual === PASOS.length - 1
    btnSig.textContent = fin ? 'Apuntar mi primer gasto' : 'Siguiente'
    btnLuego.hidden = !fin
  }

  function abrir() {
    montar()
    raiz.hidden = false
    document.documentElement.style.overflow = 'hidden'
    pasos.scrollLeft = 0; pintar()
    requestAnimationFrame(() => raiz.classList.add('mfg-ver'))
    btnSig.focus({ preventScroll: true })
  }

  function cerrar() {
    try { localStorage.setItem('guiaVista', '1') } catch (e) {}
    raiz.classList.remove('mfg-ver')
    document.documentElement.style.overflow = ''
    setTimeout(() => { raiz.hidden = true }, 300)
  }

  // ¿Ya la vio en este móvil?
  const vista = () => { try { return localStorage.getItem('guiaVista') === '1' } catch (e) { return true } }

  window.MFGuia = { abrir, vista }
})()
