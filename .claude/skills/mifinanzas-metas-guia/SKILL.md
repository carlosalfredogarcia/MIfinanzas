---
name: mifinanzas-metas-guia
description: Rediseña la pantalla de Metas de MiFinanzas (mifinanza-metas.html) como un recorrido guiado en 4 pasos — entender tu dinero real, hacer tu plan mensual, ponerte una meta realista y seguir el mes — con el estilo visual del dashboard. Úsala cuando el usuario pida mejorar, rediseñar o arreglar Metas, el planificador, el plan mensual, el seguimiento o el colchón.
---

# MiFinanzas — Metas guiadas

## La idea (palabras del usuario)

"Antes de poner una meta, tenemos que entender nuestro dinero." La pantalla guía al usuario
para que se ponga una meta de acuerdo a sus gastos reales, que sea sincero y no se ponga algo
con lo que se vaya a frustrar.

El recorrido que hace el usuario hoy, y que el diseño debe convertir en pasos claros:

1. **Tu dinero real (planificador)**
   - Ingresos: la app toma lo ingresado este mes (ej. 1.380 €). Se puede corregir a mano.
   - Gastos estimados: promedio de cada categoría en los últimos meses CERRADOS con datos
     ("lo realista, no lo que creemos que gastamos"). Cada categoría se marca Necesaria u Opcional.
   - Resultado: saldo del mes. Ej.: −124 € → "estás gastando más de lo que ingresas".
2. **Tu plan mensual**
   - Cómo repartir el dinero: gastos frente a ingresos, separados en necesarios y opcionales,
     en % o en €.
   - Elegir un tipo de ahorro: Básico (10 %), Equilibrado (15 %), Ahorrador (25 %) o Personalizado.
     El usuario elige Equilibrado: "disfrutar y avanzar".
   - La app dice: "si bajas al 85 % podrías ahorrar 207 €/mes".
   - Ajustar categoría por categoría viendo el % en tiempo real (alquiler no se toca,
     gasolina se baja a 60, salidas 160 porque son vacaciones, imprevistos 33 "siempre hay
     un gasto"…) hasta llegar al 85 %.
   - Resultado: de −124 € a ahorrar 207 €.
3. **Tu meta** (ahora sí, con base real)
   - Nombre, mes de inicio y de fin.
   - La app calcula lo acumulado de verdad (meses cerrados, sin el actual; ej. 730 €), lo que
     queda disponible según el plan en los meses restantes (ej. 621 €) y sugiere el total
     (ej. 1.350 €). Se puede cambiar.
4. **Seguimiento** para que la meta se cumpla
   - Real del mes frente a lo planeado por categoría: las que se pasaron (ej. remesas) y las
     que tienen margen. Se puede repartir lo pasado a otras categorías con margen.

## Cómo mejorarlo

- **Un recorrido, no una página larga**: cabecera con 4 pasos (Dinero · Plan · Meta ·
  Seguimiento). La primera vez se avanza paso a paso con "Siguiente". Después, la pantalla
  abre en Seguimiento, que es lo que se mira a diario, con acceso a los otros pasos.
- **Paso 1**: una sola cifra protagonista (el saldo del mes) con un veredicto honesto. Lista
  compacta de categorías con su media y el interruptor Necesaria/Opcional.
- **Paso 2**: tipos de ahorro como tarjetas que dicen lo que significan en € ("Equilibrado ·
  ahorras 207 €/mes"). Al ajustar, un medidor fijo arriba muestra en vivo el % de gasto frente
  al objetivo y "te faltan X € para tu plan". Ajustes con +/− y campo numérico; siempre visible
  la media real de la categoría.
- **Sinceridad (anti-frustración)**: si una categoría baja por debajo del 50 % de su media real,
  avisar con tono amable ("Tu media es 134 €; bajarlo a 20 puede ser difícil de cumplir").
  Nunca bloquear: el usuario decide.
- **Paso 3, meta realista**: semáforo de realismo comparando el ahorro mensual que exige la
  meta con el ahorro del plan y con lo que el usuario ha ahorrado de verdad de media:
  Realista / Ambiciosa / Difícil, con una frase que lo explique y una propuesta alcanzable.
- **Paso 4, seguimiento de lujo**: resumen del mes ("te quedan 312 € para 9 días · 34 €/día"),
  categorías en tres grupos (pasadas, con margen, fijas), barra real/plan por categoría, botón
  Repartir en las pasadas, y el progreso de la meta con "a este ritmo llegarás en…".
- **Colchón de ahorro**: se mantiene, junto a la meta.

## Contrato técnico (no romper)

- Archivo: `mifinanza-metas.html` (HTML + CSS + JS sin framework; Supabase por CDN, `auth.js`,
  `datepicker.js`, barra y + en `nav.js`).
- Tablas y lo que se usa de ellas (no cambiar estructura sin permiso):
  - `metas`: `nombre, icono, monto_objetivo, monto_actual, fecha_inicio, fecha_limite, es_principal`.
  - `colchon_movimientos`: entradas y retiradas del colchón (`tipo, monto, descripcion, fecha, activo`).
  - `user_gasto_plan` (`categoria, monto`): el plan por categoría.
  - `categoria_tipo` (`categoria, tipo, es_fijo`): necesaria/opcional y fija.
  - `user_budget_mode` (`ingresos_override`), `user_preferences` (`seguimiento_activos`, grupos
    del plan), `perfil` (`perfil_presupuesto`).
- Cálculos que son la base de la confianza del usuario y no se cambian sin decirlo:
  medias por categoría con los 3 últimos meses cerrados; ahorro real acumulado solo con meses
  cerrados; los fijos cuentan cada mes que están activos (mismo criterio que Estadísticas).
- Fallo conocido: `renderFondo` solo muestra la meta con icono 💰; si se elige otro emoji la
  meta "desaparece". Hay que mostrar la meta principal sea cual sea su icono.
- Sistema visual del dashboard (`inicio.html`): `#0a0e1a`, `#111827`, esmeralda `#10b981`,
  rojo `#ef4444`, dorado `#f59e0b`, índigo `#6366f1`, Manrope, cifras `tabular-nums`, cristal
  en la tarjeta principal. Importes en formato español con `window.moneda`. Porcentajes sin
  decimales salvo cuando importan (85 %, no 85,00 %).
- Ningún cálculo usa la API de Claude: todo en el navegador.

## Proceso

1. Leer el archivo entero (más de 3.000 líneas) antes de tocarlo.
2. Rediseñar por pasos, probando cada uno con datos de prueba a 360 y 390 px: cargar, cambiar
   tipo de ahorro, ajustar categorías, crear y editar meta, repartir, colchón.
3. Enseñar capturas y publicar en `main` cuando el usuario lo apruebe.
