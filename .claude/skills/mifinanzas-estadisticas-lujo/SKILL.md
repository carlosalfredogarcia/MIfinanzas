---
name: mifinanzas-estadisticas-lujo
description: Rediseña y amplía la pantalla de Estadísticas de MiFinanzas (mifinanza-estadisticas-v2.html) con el sistema visual del dashboard y vistas claras para entender patrones de gasto — anillo con tabla de categorías (% · media/mes · total), evolución por categoría con resumen del período, y última vez y frecuencia de un gasto. Úsala cuando el usuario pida mejorar, modernizar o añadir análisis a Estadísticas.
---

# MiFinanzas — Estadísticas de lujo

## Para qué la usa el usuario (no perderlo nunca)

Estadísticas sirve para analizar los gastos por categoría y ver qué patrones se repiten:
en qué se gasta sin darse cuenta.

- **Por mes**: todo lo que pasó en un mes concreto. Ingresos, gastos y si ese mes se
  ahorró o se tiró del ahorro.
- **Por período**: elegir varios meses para ver promedios y compararlos
  ("¿cuánto ahorré los 3 primeros meses?", "compara los últimos 3 meses").
- **Año completo** (la más útil): cómo va el año. Categorías de mayor a menor
  (alquiler, supermercado…). Detecta lo reducible: gastos imprevistos son descuidos
  (multas, suscripciones olvidadas); el alquiler no es negociable. También sirve para
  **ubicar un gasto**: "¿cuándo fue el último cambio de aceite?", "¿cada cuánto me corto el pelo?".
- **Evolución por categoría**: cómo fue cada mes. Cuenta una historia (gasolina sube al
  pasar de moto a coche y baja al volver; salidas suben en verano).

Cualquier rediseño mantiene estas cuatro cosas y las hace más fáciles de leer.

## Stack y contrato

- Un archivo: `mifinanza-estadisticas-v2.html`. HTML + CSS + JS sin framework, Supabase por CDN
  (`dbClient`), sesión en `auth.js`, barra y botón + en `nav.js`.
- Lee `gastos`, `ingresos`, `gastos_fijos`; edita `gastos` y `gastos_fijos`. No cambiar tablas ni consultas.
- Modelo en memoria: `datos` = un objeto por mes, del más reciente al más antiguo:
  `{ key:'2026-10', mes, mesNombre, mesNum, anio, ingresos, gastos, cats:{cat:total}, movs:{cat:[{id,tipo,label,fecha,monto,categoria}]} }`.
  `gastos` ya incluye los fijos.
- Funciones que no se renombran: `cargarDatos`, `recargarDatos`, `fetchDatos`, `setModo`,
  `renderPeriodo`, `renderGridMeses`, `seleccionarMes`, `renderMes`, `renderAnio`, `setResumen`,
  `dibujarCats`, `renderCatsUI`, `toggleCategoria`, `renderAnalisis`, `abrirEdicionItem`,
  `guardarEdicionItem`, `abrirPanelMas`.
- IDs que usa la lógica: `tab-periodo|mes|anio`, `vista-periodo`, `vista-mes`, `meses-sel-grid`,
  `meses-sel-count`, `meses-grid`, `loading-wrap`, `contenido`, `lbl|val|sub-ing|gas|aho`,
  `cats-title`, `cats-wrap`, `analisis-card`, `cat-select`, `evol-barras`, `analisis-nota`,
  `modal-editar-item` y sus campos `em-*`.
- Moneda: `window.moneda`. Importes en formato español (4.180,00), nunca locale fijo de otro país.

## Sistema visual

El del dashboard (`inicio.html`): fondo `#0a0e1a`, superficies `#111827`, bordes `#1f2937`,
esmeralda `#10b981` (texto `#34d399`), rojo `#ef4444` (texto `#f87171`), dorado `#f59e0b`,
índigo `#6366f1`, texto `#f1f5f9`, secundario `#94a3b8`. Manrope 400–800, cifras con
`tabular-nums`. Tarjeta principal con cristal (degradado esmeralda→índigo, blur 12 px).
Iconos SVG de trazo; emoji solo en categorías.

## Vistas (lo que el usuario aprobó)

Todo se calcula con `datos`; ninguna consulta nueva ni llamada a la API de Claude.

1. **Resultado**: ingresos, gastos y el veredicto en grande: "Ahorraste X" (esmeralda) o
   "Tiraste del ahorro X" (dorado), con el % de lo que entró.
2. **¿A dónde va tu dinero?** (un solo panel): anillo con las 5 categorías mayores + "Resto" y,
   debajo, una tabla compacta con TODAS las categorías: % · Media/mes · Total (en "Por mes": % · Total).
   Sin barras. Tocar una fila (o un tramo del anillo) despliega sus movimientos para ubicar
   o editar un gasto.
3. **Evolución por categoría**: chips, barras con promedio, mes más alto en dorado. La nota de
   abajo es el resumen del período: "Tu mejor mes fue febrero: ahorraste 495 €. En 3 meses
   gastaste más de lo que entró (…)". No poner frases tipo "bajaste X un 40 %": no le sirven.
4. **Última vez y frecuencia**: buscador sobre todos los meses con última fecha, cada cuántos
   días, meses en que ocurrió y próxima fecha estimada.

Descartado a propósito por el usuario: "qué días gastas más", "fugas de dinero" y el gráfico
"mes a mes". No volver a añadirlos sin que lo pida.

Regla de oro: nada que obligue a hacer mucho scroll; cifras con su etiqueta, sin adornos.
La pantalla no debe desplazarse sola al cambiar de modo o elegir meses (no usar `scrollIntoView`
en la página para centrar chips).

## Proceso

1. Leer el archivo entero y `inicio.html` como referencia.
2. Implementar en una rama, sin tocar consultas ni nombres del contrato.
3. Probar con datos de prueba a 360 y 390 px: los tres modos, abrir categoría, editar
   un movimiento, buscador, chips de evolución, sin errores ni scroll horizontal.
4. Enseñar capturas; publicar en `main` cuando el usuario lo diga.
