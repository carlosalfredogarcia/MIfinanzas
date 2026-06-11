// auth.js — se carga en todas las páginas, después del SDK de Supabase
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

window.dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.currentUserId = null

// Oculta la página hasta verificar sesión (evita destellos)
document.documentElement.style.visibility = 'hidden'

let _authFired = false

function _onSession(uid) {
  if (_authFired) return
  _authFired = true
  window.currentUserId = uid
  console.log('[auth] currentUserId establecido:', uid)
  document.documentElement.style.visibility = 'visible'
  setTimeout(() => document.dispatchEvent(new Event('auth-ready')), 0)
}

window.dbClient.auth.onAuthStateChange((event, session) => {
  console.log('[auth] event:', event, 'uid:', session?.user?.id ?? null)
  if (session) {
    // Cualquier evento con sesión válida (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED)
    _onSession(session.user.id)
  } else if (event === 'SIGNED_OUT') {
    window.location.replace('index.html')
  } else if (event === 'INITIAL_SESSION') {
    // Sin sesión en la carga inicial: puede ser token refresh en curso.
    // Esperar 2s antes de redirigir por si llega TOKEN_REFRESHED.
    setTimeout(() => {
      if (!_authFired) {
        console.warn('[auth] Sin sesión tras espera → redirigiendo a login')
        window.location.replace('index.html')
      }
    }, 2000)
  }
})
