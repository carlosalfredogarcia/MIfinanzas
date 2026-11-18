// netlify/lib/comun.js — lo que comparten las funciones del servidor (no es una función: no se publica sola)

const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'

const CATS_DEFAULT = [
  '🏠 Alquiler', '💳 Crédito', '📱 Línea', '🏋️ Gym', '⛽ Gasolina',
  '💻 Tecnología', '❤️ Salud', '👕 Ropa', '🎉 Salidas', '🌍 Remesas',
  '⚠️ Gastos Imprevistos', '📋 Trámite', '🚗 Vehículo', '📦 Otros',
  '🛒 Supermercado', '💧 Agua', '🧴 Cuidado personal', '📺 Suscripción', '💡 Luz', '🌐 Internet',
  '💼 Nómina'
]

const NO_CACHE = { 'content-type': 'application/json', 'cache-control': 'no-store, no-cache' }

// Usuario de la sesión de Supabase (null si el token no vale)
async function obtenerUsuario(token) {
  if (!token) return null
  try {
    const resp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY }
    })
    if (!resp.ok) return null
    const data = await resp.json()
    return data.id ? data : null
  } catch {
    return null
  }
}

module.exports = { SUPABASE_URL, SUPABASE_KEY, CATS_DEFAULT, NO_CACHE, obtenerUsuario }
