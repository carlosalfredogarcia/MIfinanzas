// idioma.js — la app en inglés. Se carga en <head>, antes que nada, en todas las pantallas.
// Las pantallas se escriben en español; si el idioma es inglés, este archivo traduce lo que
// aparece en la página (textos, placeholder, aria-label, title y avisos) con el diccionario de
// js/idioma-en.js. Las cifras y los meses se separan del texto para que «Te quedan 54,50 €»
// y «Te quedan 12 €» usen la misma frase. Lo que escribe el usuario no está en el diccionario
// y se queda como está.
;(function () {
  let guardado = null
  try { guardado = localStorage.getItem('idioma') } catch (e) {}
  const idioma = guardado || (/^en\b/i.test(navigator.language || '') ? 'en' : 'es')
  window.MF_IDIOMA = idioma
  // Cambia el idioma y recarga la pantalla
  window.cambiarIdioma = nuevo => {
    try { localStorage.setItem('idioma', nuevo) } catch (e) {}
    location.reload()
  }
  // Pruebas: «recoger» recorre la app en español y apunta en __FALTAN__ lo que no tiene traducción
  const recoger = !!window.__RECOGER__
  if (idioma === 'es' && !recoger) return

  if (!recoger) document.documentElement.lang = idioma
  // El diccionario solo se descarga cuando hace falta (y antes de que se pinte nada)
  document.write('<script src="js/idioma-en.js"><\/script>')

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const ABR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

  // Piezas que cambian dentro de una frase: importes, números, porcentajes, meses y días
  const PIEZA = new RegExp(
    '[−+\\-]?(?:[$€£]\\s?)?\\d(?:\\d|[.,:/](?=\\d))*(?:\\s?(?:€|%))?' +
    '|(?<!\\p{L})(?:' + MESES.join('|') + '|' + DIAS.join('|') + ')(?!\\p{L})' +
    '|(?<!\\p{L})(?:' + ABR.join('|') + ')(?!\\p{L})\\.?', 'giu')

  // En inglés, meses y días siempre con mayúscula (salvo que el original vaya entero en mayúsculas)
  const conMayus = (orig, t) => orig === orig.toUpperCase() ? t.toUpperCase() : t
  function piezaEn(p) {
    const b = p.toLowerCase().replace(/\.$/, '')
    let i = MESES.indexOf(b); if (i >= 0) return conMayus(p, MONTHS[i])
    i = DIAS.indexOf(b); if (i >= 0) return conMayus(p, DAYS[i])
    i = ABR.indexOf(b); if (i >= 0) return conMayus(p, MONTHS[i].slice(0, 3))
    return p
  }

  const faltan = window.__FALTAN__ = new Set()
  const letras = /\p{L}{2,}/u

  // Traduce una frase; devuelve null si no hay traducción
  function traducir(texto) {
    const D = window.MF_EN
    if (!D || !texto) return null
    const m = texto.match(/^(\s*)([\s\S]*?)(\s*)$/)
    const [, ini, nucleo, fin] = m
    if (!letras.test(nucleo)) return null
    let t = D.frases[nucleo]
    if (t === undefined) {
      // Plantilla: «Te quedan {0} hasta fin de mes.»
      const piezas = []
      const clave = nucleo.replace(PIEZA, p => '{' + (piezas.push(p) - 1) + '}')
      if (piezas.length && D.frases[clave] !== undefined) {
        t = D.frases[clave].replace(/\{(\d+)\}/g, (_, i) => piezaEn(piezas[i]))
      } else {
        // Frases con datos del usuario: «Hola, Carlos»
        for (const [re, en] of D.patrones) {
          const m = nucleo.match(re)
          const r = m && (typeof en === 'function' ? en(...m) : nucleo.replace(re, en))
          if (r != null && r !== false) return ini + r + fin
        }
        // Solo fechas y cifras: «21 oct 2026»
        if (piezas.length && !letras.test(clave.replace(/\{\d+\}/g, ''))) return ini + clave.replace(/\{(\d+)\}/g, (_, i) => piezaEn(piezas[i])) + fin
        // Emoji delante: «🛒 Supermercado»
        const e = nucleo.match(/^([^\p{L}\p{N}¿¡«"(]+)(.+)$/u)
        const resto = e && traducir(e[2])
        if (resto) return ini + e[1] + resto + fin
        faltan.add(clave)
        return null
      }
    }
    return ini + t + fin
  }
  window.MF_T = s => traducir(s) ?? s

  const ATRIBUTOS = ['placeholder', 'aria-label', 'title', 'alt']
  const SALTAR = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE'])
  const ignorado = el => !el || SALTAR.has(el.nodeName) || el.isContentEditable || (el.closest && el.closest('[translate="no"]'))

  // Lo que ya pusimos nosotros no se vuelve a traducir (el observador lo ve como un cambio)
  const hecho = new WeakMap()
  function texto(n) {
    const padre = n.parentElement
    if (ignorado(padre) || hecho.get(n) === n.data) return
    const t = traducir(n.data)
    // Una <option> sin value usa su texto como valor: se fija en español para no guardar el inglés
    if (t !== null && !recoger && padre.nodeName === 'OPTION' && !padre.hasAttribute('value')) padre.setAttribute('value', padre.textContent)
    if (t !== null && t !== n.data && !recoger) { n.data = t; hecho.set(n, t) }
  }
  function atributo(el, a) {
    const v = el.getAttribute(a)
    if (v === null || hecho.get(el)?.[a] === v) return
    const t = traducir(v)
    if (t !== null && t !== v && !recoger) { el.setAttribute(a, t); hecho.set(el, { ...hecho.get(el), [a]: t }) }
  }
  function recorrer(raiz) {
    if (raiz.nodeType === 3) return texto(raiz)
    if (raiz.nodeType !== 1 || ignorado(raiz)) return
    for (const a of ATRIBUTOS) atributo(raiz, a)
    if (raiz.nodeName === 'INPUT' && /^(button|submit)$/i.test(raiz.type)) {
      const t = traducir(raiz.value); if (t && !recoger) raiz.value = t
    }
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
    let n
    while ((n = w.nextNode())) {
      if (n.nodeType === 3) texto(n)
      else if (!ignorado(n)) for (const a of ATRIBUTOS) atributo(n, a)
    }
  }

  new MutationObserver(cambios => {
    for (const c of cambios) {
      if (c.type === 'characterData') texto(c.target)
      else if (c.type === 'attributes') { if (!ignorado(c.target)) atributo(c.target, c.attributeName) }
      else for (const n of c.addedNodes) recorrer(n)
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATRIBUTOS })

  document.addEventListener('DOMContentLoaded', () => {
    recorrer(document.body)
    const t = traducir(document.title); if (t && !recoger) { document.title = t; hecho.set(document.querySelector('title').firstChild, t) }
  })
  if (recoger) return

  // Avisos del navegador
  for (const f of ['alert', 'confirm', 'prompt']) {
    const orig = window[f].bind(window)
    window[f] = (msg, ...r) => orig(window.MF_T(String(msg ?? '')), ...r)
  }
})()
