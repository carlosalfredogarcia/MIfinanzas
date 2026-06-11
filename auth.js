// auth.js — cargado en todas las páginas protegidas, después del SDK de Supabase
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

window.dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
window.currentUserId = null

// Verificación inmediata de sesión — sin delay, sin race conditions
window.dbClient.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    window.currentUserId = session.user.id
    document.documentElement.style.visibility = 'visible'
    setTimeout(() => document.dispatchEvent(new Event('auth-ready')), 0)
  } else {
    window.location.replace('index.html')
  }
})

// Maneja logout y renovación de token durante la sesión
window.dbClient.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    window.location.replace('index.html')
  } else if (event === 'TOKEN_REFRESHED' && session) {
    window.currentUserId = session.user.id
  }
})
