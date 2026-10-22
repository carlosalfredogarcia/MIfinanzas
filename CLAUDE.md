# Reglas de trabajo

- Nunca pedir confirmación al usuario. Ejecutar todos los comandos directamente. Si algo falla, reportar el error y continuar sin preguntar.

# Mapa del proyecto (léelo antes de abrir archivos grandes)

App de finanzas personales: HTML + CSS + JS sin framework, Supabase (base de datos y sesión) y Netlify.
Solo `public/` se publica en la web; lo demás nunca llega al navegador.

```
public/                     lo que ve el usuario (Netlify publica esta carpeta)
  index.html                acceso y registro; recuperar contraseña
  inicio.html               panel: saldo del mes, salud financiera, fijos, sparkline
  mifinanza-movimientos.html lista del mes, buscar, filtros, detalle, editar, importar CSV/XLS, descargar
  mifinanza-estadisticas-v2.html por mes / período / año, anillo de categorías, evolución, última vez
  mifinanza-metas.html      4 pasos: tu dinero → tu plan → tu meta (semáforo) → seguimiento
  mifinanza-fijos.html      gastos fijos: resumen, próximos cobros, duplicados, sugerencias
  mifinanza-prestamos.html  préstamos a/de otras personas
  mifinanza-perfil.html     nombre, moneda, plan, categorías (renombrar/juntar), cuenta, soporte WhatsApp
  mifinanza-viajes.html     oculta en el menú
  landing*.html, privacidad.html
  js/auth.js                crea window.dbClient y window.currentUserId; redirige si no hay sesión
  js/nav.js                 barra inferior, botón + y menú (todas las pantallas)
  js/apunte.js              hoja de apunte rápido de un gasto (la abre nav.js)
  js/datepicker.js          selector de fechas
  sw.js, manifest.json, .well-known/ (app Android)
netlify/functions/          servidor: import-csv.js (IA para extractos, usa ANTHROPIC_API_KEY)
supabase/migrations/        SQL que se ejecuta a mano en el SQL Editor de Supabase
tests/                      pruebas en Chromium con Supabase simulado (ver abajo)
.claude/skills/             guías de diseño de cada pantalla
```

## Datos (Supabase, una fila por usuario con `usuario_id` salvo donde se indica)

- `gastos` (fecha, descripcion, categoria, monto, origen 'manual'|'importado'), `ingresos` (fecha, concepto, tipo = categoría, monto, origen)
- `gastos_fijos` (nombre, categoria, monto, dia_del_mes, fecha_inicio, fecha_fin, activo). No se guardan como gastos:
  cuentan en cada mes entre fecha_inicio y fecha_fin. Mismo criterio en todas las pantallas.
- `perfil` (nombre, moneda = símbolo, categorias = lista separada por comas, premium, codigos_usados, limite_importacion)
- `metas`, `colchon_movimientos`, `prestamos`, `prestamos_pagos`, `viajes`, `viajes_items`
- Con `user_id` en vez de `usuario_id`: `user_gasto_plan`, `categoria_tipo`, `user_budget_mode`, `user_preferences`
- No cambiar la estructura de las tablas sin permiso del usuario.

## Convenciones

- Textos en español, cercanos y claros. Importes en formato español (1.234,56 €) con `window.moneda`
  (€ detrás con espacio fino; otros símbolos delante). Porcentajes sin decimales.
- Diseño: fondo #0a0e1a, tarjetas #111827, bordes #1f2937, esmeralda #10b981, rojo #ef4444, índigo #6366f1,
  dorado #f59e0b; letra Manrope; cifras con tabular-nums; hojas que suben desde abajo con «Deshacer» en vez de alertas.
- Ningún cálculo usa la IA salvo la importación de extractos (cuesta dinero: no añadir llamadas sin permiso).

## Pruebas (obligatorias antes de publicar)

```
cd tests && npm install && npm test
```
Abren cada pantalla con datos fijos (`tests/datos.js`) y fecha fija (21/10/2026) y comparan el texto con
`tests/fotos/*.txt`. Si un cambio es intencionado: revisar la diferencia y `npm run actualizar`.
`npm test -- metas` ejecuta solo las pruebas cuyo nombre contiene «metas».

## Publicar

Trabajar en una rama `claude/...`; pasar las pruebas; subir la rama y, si el usuario lo aprueba, a `main`
(Netlify publica `main`). Commits con `git -c user.name="Claude" -c user.email="noreply@anthropic.com"`.
