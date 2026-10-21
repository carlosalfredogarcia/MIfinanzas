---
name: mifinanzas-estadisticas-lujo
description: Rediseña y amplía la pantalla de Estadísticas de MiFinanzas (mifinanza-estadisticas-v2.html) con el sistema visual del dashboard y vistas "de película" para entender patrones de gasto — reparto en anillo, fugas de dinero, días de la semana, comparativa de meses, buscador de "¿cuándo fue la última vez?" y evolución por categoría con promedio. Úsala cuando el usuario pida mejorar, modernizar o añadir análisis a Estadísticas.
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

## Vistas de lujo ("de película")

Todo se calcula con `datos`; ninguna consulta nueva.

1. **Cabecera de resultado**: ingresos, gastos y el veredicto en grande: "Ahorraste X"
   (esmeralda) o "Tiraste del ahorro X" (dorado), con tasa de ahorro en %.
2. **Anillo de reparto**: SVG con las 5 categorías mayores + "Resto", total en el centro.
   Tocar un tramo abre esa categoría en el ranking.
3. **Ranking de categorías**: de mayor a menor, % del total, barra, promedio/mes y la lista
   de movimientos al abrirla (para ubicar gastos). Etiqueta **Reducible** en categorías
   discrecionales (imprevistos, suscripciones, salidas, antojos).
4. **Fugas de dinero**: suma de las categorías reducibles del período y cuánto se ahorraría
   al año recortándolas a la mitad.
5. **Qué días gastas más**: barras por día de la semana (solo gastos variables) y una frase
   ("Los sábados gastas 2,3× más que la media").
6. **Comparativa de meses** (período y año): ingresos vs gastos por mes en barras dobles,
   mes con más ahorro marcado.
7. **¿Cuándo fue la última vez?**: buscador sobre todos los meses. Por cada coincidencia:
   última fecha, veces, cada cuántos días de media y total.
8. **Evolución por categoría**: selector en chips, barras con línea de promedio, el mes más
   alto en dorado, valores encima y una nota que cuenta la tendencia (sube/baja frente
   al promedio y frente al mes anterior).

Movimiento: entradas en cascada, barras que crecen, anillo que se dibuja; nada en bucle.
`prefers-reduced-motion` lo apaga.

## Proceso

1. Leer el archivo entero y `inicio.html` como referencia.
2. Implementar en una rama, sin tocar consultas ni nombres del contrato.
3. Probar con datos de prueba a 360 y 390 px: los tres modos, abrir categoría, editar
   un movimiento, buscador, chips de evolución, sin errores ni scroll horizontal.
4. Enseñar capturas; publicar en `main` cuando el usuario lo diga.
