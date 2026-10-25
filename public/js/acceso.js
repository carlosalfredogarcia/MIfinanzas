// index.html — se carga al final de la página, después de auth.js
const SUPABASE_URL = 'https://gapeweomesgawnodarsp.supabase.co'
const SUPABASE_KEY = 'sb_publishable_u7ug3SBOsuz2zb56gqBLjw_aLJ0Vvp8'
const dbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)

let modoRecuperacion = false
let authListo = false

// Detecta ambos flujos: PKCE (?code) e implícito (#access_token&type=recovery)
const _sp = new URLSearchParams(window.location.search)
const _hp = new URLSearchParams(window.location.hash.replace(/^#/, ''))
const pkceCode = _sp.get('code')
const hashRecovery = _hp.get('type') === 'recovery' && _hp.has('access_token')

async function inicializar() {
  if (pkceCode) {
    // Flujo PKCE: intercambia el código (Google OAuth, magic link, recuperación)
    document.getElementById('loading-text').textContent = 'Verificando...'
    const { error } = await dbClient.auth.exchangeCodeForSession(pkceCode)
    if (error) {
      document.getElementById('loading').classList.remove('visible')
      mostrarError('Este enlace ya no sirve: caducó o ya se usó. Pide uno nuevo y lo tendrás en tu correo en un momento.')
      return
    }
    // Éxito: onAuthStateChange decide si es PASSWORD_RECOVERY o redirige al inicio
    authListo = true
    return
  } else if (hashRecovery) {
    // Flujo implícito: el SDK ya procesó el token del hash
    modoRecuperacion = true
    document.getElementById('loading').classList.remove('visible')
    setTab('nueva-clave')
  } else {
    // Carga normal: verificar sesión existente antes de mostrar el formulario
    const { data: { session } } = await dbClient.auth.getSession()
    if (session) {
      window.location.replace('inicio.html')
      return
    }
    document.getElementById('loading').classList.remove('visible')
  }
  authListo = true
}

dbClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('loading').classList.remove('visible')
    modoRecuperacion = true
    setTab('nueva-clave')
    return
  }
  // Redirige tras OAuth/PKCE completado (Google, magic link, etc.)
  if (pkceCode && authListo && session && !modoRecuperacion) {
    window.location.replace('inicio.html')
    return
  }
  // Redirige si ya hay sesión activa (login normal, sesión restaurada)
  if (authListo && !pkceCode && !hashRecovery && !modoRecuperacion && session) {
    window.location.replace('inicio.html')
  }
})

inicializar()

function setTab(tab) {
  const enTabs = tab === 'entrar' || tab === 'crear'
  document.getElementById('tabs').style.display = enTabs ? '' : 'none'
  document.getElementById('tab-entrar').classList.toggle('active', tab === 'entrar')
  document.getElementById('tab-crear').classList.toggle('active', tab === 'crear')
  for (const s of ['entrar', 'crear', 'recuperacion', 'nueva-clave']) {
    document.getElementById('form-' + s).classList.toggle('active', s === tab)
  }
  ocultarError()
  ocultarExito()
}

// Traduce los errores de Supabase a mensajes cercanos
function mensajeAmable(error) {
  const m = (error && error.message || '').toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'El correo o la contraseña no coinciden. Revísalos con calma e inténtalo de nuevo.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Este correo ya tiene una cuenta. Entra desde la pestaña «Entrar».'
  if (m.includes('not confirmed')) return 'Aún no has confirmado tu correo. Busca nuestro mensaje en tu bandeja de entrada (o en spam).'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Has hecho varios intentos seguidos. Espera un minuto y vuelve a probar.'
  if (m.includes('fetch') || m.includes('network')) return 'No hay conexión. Comprueba tu internet e inténtalo otra vez.'
  if (m.includes('invalid') && m.includes('email') || m.includes('validate email')) return 'Ese correo no parece válido. Revisa que esté bien escrito.'
  if (m.includes('should be different') || m.includes('same password')) return 'La nueva contraseña tiene que ser distinta de la anterior.'
  if (m.includes('password')) return 'La contraseña debe tener al menos 6 caracteres.'
  return 'Algo no ha salido bien. Inténtalo de nuevo en un momento.'
}

// Ojo de los campos de contraseña
function verClave(btn) {
  const inp = btn.parentElement.querySelector('input')
  const ver = inp.type === 'password'
  inp.type = ver ? 'text' : 'password'
  btn.classList.toggle('ver', ver)
  btn.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña')
}

function mostrarError(msg) {
  const el = document.getElementById('error-msg')
  el.textContent = msg
  el.classList.remove('visible')
  void el.offsetWidth  // vuelve a lanzar la animación si el aviso ya estaba a la vista
  el.classList.add('visible')
}

function ocultarError() {
  document.getElementById('error-msg').classList.remove('visible')
}

function mostrarExito(msg) {
  const el = document.getElementById('success-msg')
  el.textContent = msg
  el.classList.add('visible')
}

function ocultarExito() {
  document.getElementById('success-msg').classList.remove('visible')
}

function mostrarCarga(texto, sub) {
  document.getElementById('loading-text').textContent = texto
  document.getElementById('loading-sub').textContent  = sub || ''
  document.getElementById('loading').classList.add('visible')
}

// Asigna datos sin usuario_id (pre-auth) al usuario autenticado
async function migrarDatosExistentes(userId) {
  const tablas = ['gastos', 'ingresos', 'gastos_fijos', 'metas', 'perfil']
  for (const tabla of tablas) {
    await dbClient.from(tabla).update({ usuario_id: userId }).is('usuario_id', null)
  }
}

async function iniciarSesion() {
  const email = document.getElementById('login-email').value.trim()
  const pass  = document.getElementById('login-pass').value
  if (!email || !pass) { mostrarError('Escribe tu correo y tu contraseña para entrar.'); return }

  ocultarError()
  mostrarCarga('Verificando...', '')

  const { data, error } = await dbClient.auth.signInWithPassword({ email, password: pass })

  if (error) {
    document.getElementById('loading').classList.remove('visible')
    mostrarError(mensajeAmable(error))
    return
  }

  mostrarCarga('Cargando tu cuenta...', 'Un momento...')
  await migrarDatosExistentes(data.user.id)
  window.location.replace('inicio.html')
}

async function crearCuenta() {
  const email = document.getElementById('reg-email').value.trim()
  const pass  = document.getElementById('reg-pass').value
  const pass2 = document.getElementById('reg-pass2').value
  if (!email || !pass)  { mostrarError('Rellena tu correo y una contraseña para crear la cuenta.'); return }
  if (pass !== pass2)   { mostrarError('Las dos contraseñas no coinciden. Vuelve a escribirlas.'); return }
  if (pass.length < 6)  { mostrarError('La contraseña debe tener al menos 6 caracteres.'); return }

  ocultarError()
  mostrarCarga('Creando tu cuenta...', '')

  const { data, error } = await dbClient.auth.signUp({ email, password: pass })

  if (error) {
    document.getElementById('loading').classList.remove('visible')
    mostrarError(mensajeAmable(error))
    return
  }

  // Sin sesión = confirmación de email pendiente
  if (!data.session) {
    document.getElementById('loading').classList.remove('visible')
    mostrarExito('¡Cuenta creada! Revisa tu correo y confirma tu cuenta para poder entrar.')
    return
  }

  mostrarCarga('Configurando tu cuenta...', 'Vinculando tus datos...')
  await dbClient.from('perfil').upsert(
    { usuario_id: data.user.id, nombre: '', moneda: '$', color: '#b8f564', categorias: '' },
    { onConflict: 'usuario_id', ignoreDuplicates: true }
  )
  window.location.replace('inicio.html')
}

async function enviarRecuperacion() {
  const email = document.getElementById('rec-email').value.trim()
  if (!email) { mostrarError('Escribe el correo con el que te registraste.'); return }
  ocultarError()
  mostrarCarga('Enviando enlace...', '')
  const { error } = await dbClient.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://dulcet-raindrop-bf51bd.netlify.app/index.html'
  })
  document.getElementById('loading').classList.remove('visible')
  if (error) { mostrarError(mensajeAmable(error)); return }
  mostrarExito('Enlace enviado. Revisa tu correo y haz clic en el enlace para restablecer tu contraseña.')
}

async function guardarNuevaClave() {
  const pass  = document.getElementById('nueva-pass').value
  const pass2 = document.getElementById('nueva-pass2').value
  if (!pass)           { mostrarError('Escribe tu nueva contraseña.'); return }
  if (pass.length < 6) { mostrarError('La contraseña debe tener al menos 6 caracteres.'); return }
  if (pass !== pass2)  { mostrarError('Las dos contraseñas no coinciden. Vuelve a escribirlas.'); return }
  ocultarError()
  mostrarCarga('Guardando contraseña...', '')
  const { error } = await dbClient.auth.updateUser({ password: pass })
  document.getElementById('loading').classList.remove('visible')
  if (error) { mostrarError(mensajeAmable(error)); return }
  mostrarCarga('¡Contraseña actualizada!', 'Entrando a tu cuenta...')
  setTimeout(() => window.location.replace('inicio.html'), 1500)
}

// Enter para enviar el formulario activo
document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter') return
  if (e.target.classList && e.target.classList.contains('tab')) { e.target.click(); return }
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return
  if (document.getElementById('form-entrar').classList.contains('active'))           iniciarSesion()
  else if (document.getElementById('form-crear').classList.contains('active'))       crearCuenta()
  else if (document.getElementById('form-recuperacion').classList.contains('active')) enviarRecuperacion()
  else if (document.getElementById('form-nueva-clave').classList.contains('active'))  guardarNuevaClave()
})
