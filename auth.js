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

window.dbClient.auth.getSession().then(({ data: { session } }) => {
  if (!session) {
    window.location.replace('login.html')
    return
  }
  window.currentUserId = session.user.id
  document.documentElement.style.visibility = 'visible'
  document.dispatchEvent(new Event('auth-ready'))
})
