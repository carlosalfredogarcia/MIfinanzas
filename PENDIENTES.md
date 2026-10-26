# Tareas pendientes

Lista viva: al empezar una conversación nueva, leer esto y `CLAUDE.md`. Al terminar algo, quitarlo de aquí.

## Del usuario (en el ordenador)

0. **Icono de la app de Google Play**: la web y la app instalada desde el navegador ya usan el logo
   nuevo (`public/icon.svg`, `icon-512.png`), pero la app de Play (TWA com.mifinanza.app) lleva el
   icono dentro: hay que volver a generarla (Bubblewrap o PWABuilder) con `icon-512.png` y subir
   una versión nueva a Play Console.

1. **Supabase → SQL Editor**: ejecutar `supabase/migrations/indices_rendimiento.sql` y
   `supabase/migrations/comprobantes.sql` (no cambian tablas ni datos; el segundo activa los
   comprobantes de Préstamos, que hasta entonces avisan «aún no están activados»).
2. **Límite de importación** (rama `claude/limite-servidor`, sin publicar):
   - Revisar en console.anthropic.com → Usage por qué cada importación de ~400 movimientos costó
     ~70 céntimos (modelo, tokens, otras claves).
   - Netlify → variables: `SUPABASE_SERVICE_ROLE_KEY`, `CODIGOS_DESBLOQUEO` (códigos nuevos; los
     antiguos estuvieron a la vista), opcional `IMPORT_MODEL=claude-haiku-5-5`.
   - Ponerse `premium = true` en su fila de `perfil` para la demo de 411 movimientos.
   - Después, Claude adapta la rama a la estructura nueva (public/js/movimientos.js, netlify/lib),
     añade pruebas y se ejecuta `migration_limite_servidor.sql`.
3. **Google Play**: enviar los enlaces de la prueba cerrada a los testers (faltan 11). Deben seguir
   apuntados 14 días seguidos; luego pedir acceso a producción.

## Publicado en `main` (25/10/2026)

- Pantalla de acceso nueva (Manrope, aurora y luces vivas, logo propio, cristal con borde de luz, ver contraseña, avisos amables).
- Inicio: porcentajes sin decimales; Saldo → Movimientos, Salud → Metas, Fijos → Gastos fijos.
- Perfil: «Borrar todos mis movimientos» (abre la confirmación de Movimientos con `#borrar-todo`).

## Campaña del kit (300 kits a guarderías, QR → página del kit → MiFinanza)

- Página nueva en `kit/` hecha y aprobada. Se le pasó al usuario `alfrega-kit.zip` para subirla a mano.
- El usuario va a guardar la clave de Netlify en «Secretos de red» (api.netlify.com, Authorization: Bearer …).
  En el chat nuevo: publicar `kit/` en alfrega-kit con la API (ver CLAUDE.md) y verificar con curl.
  La clave caduca (90 días o la fecha que eligió): si da 401, pedirle que cree otra.
- El QR impreso abre `alfrega-kit.netlify.app` (confirmado): al conectar ese sitio, las 300 cajas ya llevan a la página nueva.
- Vídeo de Carlos (20–30 s, vertical): subirlo como `kit/img/carlos.mp4` y activar el <video> de «Un mensaje para ti».
- Siguientes pasos de la estrategia: enlace distinto por guardería (`?desde=kit-<guarderia>`) para medir.

## De Claude (cuando el usuario lo pida)

- Atajo de iPhone «Al pagar con Wallet» (o MacroDroid en Android) que abra
  `inicio.html?accion=gasto&importe=…&comercio=…`. Si usa la app de Play (TWA com.mifinanza.app),
  añadir shareTarget en su configuración para «Compartir con MiFinanza».
- Mensaje para los testers de Google Play (qué es, cómo apuntarse, qué probar).
- Borrado de cuenta automático (hoy se pide por WhatsApp): necesita `SUPABASE_SERVICE_ROLE_KEY`.
- Vídeo demo: hecho sin voz (`cd tests && npm run video`, ~2 min, subtítulos en español). Cuando el
  usuario mande su audio, ajustar los tiempos de cada escena a su voz y mezclarlo con ffmpeg.
