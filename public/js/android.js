// android.js — lo que manda la app de Android (Google Play) al abrir MiFinanza. Se carga en <head>, tras idioma.js.
// La app nativa abre la web con ?app=android&permiso=0|1&avisos=[{t,x,f}…] (avisos del banco pendientes).
// Se guarda en el móvil y se quita de la dirección, para que sobreviva a iniciar sesión;
// nav.js apunta los avisos en cuanto hay sesión y Perfil enseña el interruptor solo dentro de la app.
;(function () {
  const ls = {
    get: k => { try { return localStorage.getItem(k) } catch (e) { return null } },
    set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} },
    del: k => { try { localStorage.removeItem(k) } catch (e) {} },
  }
  const q = new URLSearchParams(location.search)
  if (q.get('app') === 'android') {
    ls.set('appAndroid', '1')
    if (q.has('permiso')) ls.set('avisosPermiso', q.get('permiso') === '1' ? '1' : '0')
    try {
      const nuevos = JSON.parse(q.get('avisos') || '[]')
      if (Array.isArray(nuevos) && nuevos.length) {
        const antes = JSON.parse(ls.get('avisosPendientes') || '[]')
        ls.set('avisosPendientes', JSON.stringify(antes.concat(nuevos).slice(-100)))
      }
    } catch (e) {}
    ;['app', 'permiso', 'avisos'].forEach(k => q.delete(k))
    const resto = q.toString()
    history.replaceState(null, '', location.pathname + (resto ? '?' + resto : '') + location.hash)
  }

  window.MFAndroid = {
    // Dentro de la app de Android de Play
    enApp: () => ls.get('appAndroid') === '1',
    // ¿Tiene MiFinanza el acceso a notificaciones?
    permiso: () => ls.get('avisosPermiso') === '1',
    // Avisos del banco pendientes de apuntar (y los quita de la cola)
    sacarAvisos: () => {
      let a = []
      try { a = JSON.parse(ls.get('avisosPendientes') || '[]') } catch (e) {}
      ls.del('avisosPendientes')
      return Array.isArray(a) ? a : []
    },
    // Abre la pantalla de Android para dar o quitar el permiso
    abrirPermiso: () => { location.href = 'mifinanza://avisos' },
  }
})()
