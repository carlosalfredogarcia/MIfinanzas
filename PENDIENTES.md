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
3. **Google Play** (27/10/2026): 4 testers han aceptado de 12 (5 en la lista; 2 dispositivos con la app
   instalada). Faltan 8: sus 2 dispositivos propios (tablet y otro móvil) + 6 personas reales (grupos de
   testers mutuos, familia, campaña del kit). Los 14 días empiezan con 12 inscritos a la vez; luego pedir
   acceso a producción. No usar cuentas falsas.

## Publicado en `main` (25/10/2026)

- Pantalla de acceso nueva (Manrope, aurora y luces vivas, logo propio, cristal con borde de luz, ver contraseña, avisos amables).
- Inicio: porcentajes sin decimales; Saldo → Movimientos, Salud → Metas, Fijos → Gastos fijos.
- Perfil: «Borrar todos mis movimientos» (abre la confirmación de Movimientos con `#borrar-todo`).

## Campaña del kit (300 kits a guarderías, QR → página del kit → MiFinanza)

- Página nueva en `kit/` publicada en alfrega-kit.netlify.app (26/10/2026) con la API de Netlify.
  La clave está en «Secretos de red» (api.netlify.com, tipo Bearer) y caduca: si da 401, pedirle otra.
- El QR impreso abre `alfrega-kit.netlify.app` (confirmado): al conectar ese sitio, las 300 cajas ya llevan a la página nueva.
- Vídeo de Carlos (20–30 s, vertical): subirlo como `kit/img/carlos.mp4` y activar el <video> de «Un mensaje para ti».
- Siguientes pasos de la estrategia: enlace distinto por guardería (`?desde=kit-<guarderia>`) para medir.

## De Claude (cuando el usuario lo pida)

- Gasto desde la notificación del banco (Android, el usuario tiene Samsung): se le explicó MacroDroid
  (disparador «Notificación recibida» de la app del banco o Google Wallet → «Abrir sitio web»
  `https://dulcet-raindrop-bf51bd.netlify.app/inicio.html?guardar=1&titulo=[notification_title]&texto=[notification]`;
  con guardar=1 se guarda solo, con «Deshacer»; sin categoría conocida va a «Otros»). `leerMensajeBanco` es genérico
  (cualquier banco; Bizum recibido → ingreso; no guarda códigos, rechazos ni avisos de saldo); casos en
  tests/pruebas/5-bancos.js. Su banco es Santander: cuando tenga un aviso real que no se lea bien, añadirlo ahí.
- Mensaje para los testers de Google Play (qué es, cómo apuntarse, qué probar).
- Borrado de cuenta automático (hoy se pide por WhatsApp): necesita `SUPABASE_SERVICE_ROLE_KEY`.
- Vídeo demo con voz (lo pidió para más adelante): 1) el usuario manda un CSV con los números exactos que
  quiere que salgan → cargarlo en tests/datos-demo.js; 2) manda su nota de voz → reescribir las escenas de
  tests/video-demo.js al ritmo de su voz, grabar (`npm run video`) y mezclar el audio con ffmpeg.
