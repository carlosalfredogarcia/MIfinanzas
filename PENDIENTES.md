# Tareas pendientes

Lista viva: al empezar una conversación nueva, leer esto y `CLAUDE.md`. Al terminar algo, quitarlo de aquí.

## Del usuario (en el ordenador)

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

## De Claude (cuando el usuario lo pida)

- Atajo de iPhone «Al pagar con Wallet» (o MacroDroid en Android) que abra
  `inicio.html?accion=gasto&importe=…&comercio=…`. Si usa la app de Play (TWA com.mifinanza.app),
  añadir shareTarget en su configuración para «Compartir con MiFinanza».
- Mensaje para los testers de Google Play (qué es, cómo apuntarse, qué probar).
- Borrado de cuenta automático (hoy se pide por WhatsApp): necesita `SUPABASE_SERVICE_ROLE_KEY`.
- Versión en inglés (archivo de traducciones + selector en Perfil).
- Vídeo demo con la voz del usuario (Remotion, repo estetica-web/video) cuando mande el audio.
