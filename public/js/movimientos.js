// mifinanza-movimientos.html — se carga al final de la página, después de auth.js
window.moneda = localStorage.getItem('moneda') || '$'
const _color = localStorage.getItem('color'); if (_color) document.documentElement.style.setProperty('--accent', _color)

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
let mesActual = new Date().getMonth();
let anioActual = new Date().getFullYear();
let categoriaActiva = 'todas';
let todosMovimientos = [];
let filtradosActuales = [];

function actualizarMesLabel() {
  document.getElementById('mes-label').textContent = meses[mesActual] + ' ' + anioActual;
  document.getElementById('mes-subtitle').textContent = meses[mesActual] + ' ' + anioActual;
}

function cambiarMes(dir) {
  mesActual += dir;
  if (mesActual > 11) { mesActual = 0; anioActual++; }
  if (mesActual < 0)  { mesActual = 11; anioActual--; }
  actualizarMesLabel();
  cargarMovimientos();
}

function abrirModalCSV() {
  // Ensure datepicker is initialized before programmatically setting values
  if (window.initDatePickerField) {
    initDatePickerField('csv-rango-desde')
    initDatePickerField('csv-rango-hasta')
  }
  const mm = String(mesActual + 1).padStart(2, '0')
  const ultimo = new Date(anioActual, mesActual + 1, 0).getDate()
  document.getElementById('csv-rango-desde').value = `${anioActual}-${mm}-01`
  document.getElementById('csv-rango-hasta').value = `${anioActual}-${mm}-${String(ultimo).padStart(2, '0')}`
  document.getElementById('modal-csv-rango').style.display = 'flex'
}

// Llegada desde Perfil → «Descargar mis movimientos» (#descargar) o «Borrar todos mis movimientos» (#borrar-todo)
if (location.hash === '#descargar' || location.hash === '#borrar-todo') {
  const abrir = location.hash === '#descargar' ? () => abrirModalCSV() : () => abrirBorrarTodo()
  history.replaceState(null, '', location.pathname)
  let n = 0
  const iv = setInterval(() => { if (window.currentUserId) { clearInterval(iv); abrir() } else if (++n > 100) clearInterval(iv) }, 100)
}

function cerrarModalCSV() {
  document.getElementById('modal-csv-rango').style.display = 'none'
}

async function confirmarDescargaCSV() {
  const elDesde = document.getElementById('csv-rango-desde')
  const elHasta = document.getElementById('csv-rango-hasta')
  // Read via getter (Object.defineProperty); fall back to native attribute if getter returns empty
  const desde = elDesde.value || elDesde.getAttribute('value') || ''
  const hasta = elHasta.value || elHasta.getAttribute('value') || ''
  if (!desde || !hasta) { alert('Selecciona ambas fechas'); return }
  if (desde > hasta) { alert('La fecha de inicio debe ser anterior al fin'); return }

  const btn = document.getElementById('csv-rango-btn-ok')
  const textoOrig = btn.textContent
  btn.textContent = '⏳ Generando...'
  btn.disabled = true

  try {
    const uid = window.currentUserId
    if (!uid) return

    const [{ data: gastos }, { data: ingresos }, { data: fijos }] = await Promise.all([
      dbClient.from('gastos').select('fecha,descripcion,categoria,monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
      dbClient.from('ingresos').select('fecha,concepto,tipo,monto').eq('usuario_id', uid).gte('fecha', desde).lte('fecha', hasta).order('fecha', { ascending: false }),
      dbClient.from('gastos_fijos').select('fecha_inicio,fecha_fin,nombre,categoria,monto,dia_del_mes').eq('usuario_id', uid).lte('fecha_inicio', hasta).or(`fecha_fin.gte.${desde},fecha_fin.is.null`)
    ])

    const filas = []
    for (const g of (gastos   || [])) filas.push([g.fecha, g.descripcion, g.categoria, g.monto, 'Gasto'])
    for (const i of (ingresos || [])) filas.push([i.fecha, i.concepto, i.tipo, i.monto, 'Ingreso'])
    for (const f of (fijos    || [])) {
      const dia = f.dia_del_mes || 1
      // Expand: one row per month in the range where the fijo is active
      let cur = new Date(new Date(desde + 'T00:00:00').getFullYear(), new Date(desde + 'T00:00:00').getMonth(), 1)
      const dEnd = new Date(hasta + 'T00:00:00')
      while (cur <= dEnd) {
        const lastDay  = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate()
        const diaReal  = Math.min(dia, lastDay)
        const fechaFijo = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(diaReal).padStart(2,'0')}`
        if (fechaFijo >= desde && fechaFijo <= hasta && fechaFijo >= f.fecha_inicio && (!f.fecha_fin || fechaFijo <= f.fecha_fin)) {
          filas.push([fechaFijo, f.nombre, f.categoria, f.monto, 'Gasto fijo'])
        }
        cur.setMonth(cur.getMonth() + 1)
      }
    }
    filas.sort((a, b) => new Date(b[0]) - new Date(a[0]))

    const escape = v => '"' + String(v ?? '').replace(/"/g, '""') + '"'
    const csvContent = [
      ['Fecha', 'Concepto', 'Categoría', 'Importe', 'Tipo'],
      ...filas
    ].map(row => row.map(escape).join(',')).join('\n')

    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimientos-${desde}_${hasta}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    cerrarModalCSV()
  } finally {
    btn.textContent = textoOrig
    btn.disabled = false
  }
}

async function cargarMovimientos() {
  document.getElementById('lista').innerHTML = esqueletos();
  let uid = window.currentUserId;
  if (!uid) {
    uid = await new Promise(resolve => {
      const iv = setInterval(() => {
        if (window.currentUserId) { clearInterval(iv); resolve(window.currentUserId); }
      }, 50);
      setTimeout(() => { clearInterval(iv); resolve(null); }, 5000);
    });
  }
  if (!uid) return;
  const inicio = anioActual + '-' + String(mesActual + 1).padStart(2,'0') + '-01';
  const ultimoDia = new Date(anioActual, mesActual + 1, 0).getDate();
  const fin = anioActual + '-' + String(mesActual + 1).padStart(2,'0') + '-' + String(ultimoDia).padStart(2,'0');
  const [{ data: gastos }, { data: ingresos }, { data: fijos }] = await Promise.all([
    dbClient.from('gastos').select('*').eq('usuario_id', uid).gte('fecha', inicio).lte('fecha', fin).order('fecha', { ascending: false }),
    dbClient.from('ingresos').select('*').eq('usuario_id', uid).gte('fecha', inicio).lte('fecha', fin).order('fecha', { ascending: false }),
    dbClient.from('gastos_fijos').select('*').eq('usuario_id', uid).lte('fecha_inicio', fin).or(`fecha_fin.gte.${inicio},fecha_fin.is.null`)
  ]);
  const movGastos   = (gastos   || []).map(g => ({ ...g, tipo: 'gasto' }));
  const movIngresos = (ingresos || []).map(i => ({ ...i, tipo: 'ingreso', descripcion: i.concepto, categoria: i.tipo }));
  const movFijos    = (fijos    || []).map(f => {
    const dia    = f.dia_del_mes ? String(f.dia_del_mes).padStart(2, '0') : '01';
    const mesStr = String(mesActual + 1).padStart(2, '0');
    let fechaFijo = `${anioActual}-${mesStr}-${dia}`;
    if (fechaFijo < inicio) fechaFijo = inicio;
    if (fechaFijo > fin)    fechaFijo = fin;
    return { ...f, tipo: 'fijo', descripcion: f.nombre, fecha: fechaFijo };
  });
  todosMovimientos = [...movGastos, ...movIngresos, ...movFijos].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const n = todosMovimientos.length;
  document.getElementById('mes-count').textContent = n + (n === 1 ? ' movimiento' : ' movimientos');
  const totalIng = movIngresos.reduce((s, i) => s + parseFloat(i.monto), 0);
  const totalGas = [...movGastos, ...movFijos].reduce((s, g) => s + parseFloat(g.monto), 0);
  pintarResumen(totalIng, totalGas);
  renderChips();
  renderPulso();
  renderComercios();
  renderLista();
}

function filtrar(el, cat) {
  document.querySelectorAll('.filtro-chip').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
  el.classList.add('active'); el.setAttribute('aria-pressed', 'true');
  categoriaActiva = cat;
  renderLista();
}

function getIcon(categoria) {
  if (!categoria) return '📦';
  const first = [...categoria.trim()][0];
  return first && first.codePointAt(0) > 127 ? first : '📦';
}

// ── Utilidades de presentación ──
// Siempre con céntimos
const fmt = n => MF.dinero(n, 2);
const esGasto = m => m.tipo === 'gasto' || m.tipo === 'fijo';
const importe = m => parseFloat(m.monto) || 0;
const sinEmoji = c => { const t = (c || '').trim(); const f = [...t][0]; return f && f.codePointAt(0) > 127 ? t.slice(f.length).trim() : t; };
const SVG = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

function esqueletos() {
  return '<div aria-label="Cargando movimientos">' + [0, 1].map(() => '<div class="esq-dia"></div>' + '<div class="esqueleto"></div>'.repeat(3)).join('') + '</div>';
}

// Cifra que cuenta hasta su valor (600 ms)
function contar(el, valor) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = fmt(valor); return; }
  const t0 = performance.now();
  const paso = t => { const k = Math.min(1, (t - t0) / 600); el.textContent = fmt(valor * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(paso); };
  requestAnimationFrame(paso);
}

function pintarResumen(ing, gas) {
  const bal = ing - gas;
  const el = document.getElementById('res-balance');
  el.classList.toggle('neg', bal < 0);
  contar(el, bal);
  contar(document.getElementById('total-ingresos'), ing);
  contar(document.getElementById('total-gastos'), gas);
  const tot = ing + gas;
  document.getElementById('comp-ing').style.width = (tot ? ing / tot * 100 : 50) + '%';
  document.getElementById('comp-gas').style.width = (tot ? gas / tot * 100 : 50) + '%';
}

// ── Pulso del mes: una barra por día con el gasto de ese día ──
function renderPulso() {
  const cont = document.getElementById('pulso');
  const dias = new Date(anioActual, mesActual + 1, 0).getDate();
  const porDia = Array(dias).fill(0);
  todosMovimientos.filter(esGasto).forEach(m => { const d = +m.fecha.slice(8, 10); if (d >= 1 && d <= dias) porDia[d - 1] += importe(m); });
  const max = Math.max(...porDia, 0);
  const hoyStr = new Date().toISOString().split('T')[0];
  const pref = anioActual + '-' + String(mesActual + 1).padStart(2, '0') + '-';
  cont.innerHTML = porDia.map((v, i) => {
    const f = pref + String(i + 1).padStart(2, '0');
    const cls = f === hoyStr ? 'hoy' : f > hoyStr ? 'futuro' : v ? '' : 'sin-gasto';
    const h = max ? Math.max(4, v / max * 100) : 4;
    return `<button type="button" class="${cls}" ${v ? '' : 'disabled'} data-fecha="${f}" aria-label="Día ${i + 1}: ${fmt(v)}" title="Día ${i + 1}: ${fmt(v)}"><i style="height:${h}%;animation-delay:${i * 12}ms"></i></button>`;
  }).join('');
  document.getElementById('pulso-dias').innerHTML = `<span>1</span><span>${Math.ceil(dias / 2)}</span><span>${dias}</span>`;
  document.getElementById('pulso-max').textContent = max ? 'Día más alto: ' + fmt(max) : 'Sin gastos este mes';
  cont.querySelectorAll('button[data-fecha]').forEach(b => b.addEventListener('click', () => {
    const g = document.querySelector(`.dia-grupo[data-fecha="${b.dataset.fecha}"]`);
    if (g) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

// ── Chips: Todos · Gastos · Ingresos · Fijos · 4 categorías con más gasto ──
function renderChips() {
  const porCat = {};
  todosMovimientos.filter(esGasto).forEach(m => { if (m.categoria) porCat[m.categoria] = (porCat[m.categoria] || 0) + importe(m); });
  const top = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  if (!['todas', 'gastos', 'ingresos', 'fijos'].includes(categoriaActiva) && !top.includes(categoriaActiva)) categoriaActiva = 'todas';
  const chips = [['todas', 'Todos'], ['gastos', 'Gastos'], ['ingresos', 'Ingresos'], ['fijos', 'Fijos'], ...top.map(c => [c, c])];
  const cont = document.getElementById('chips');
  cont.innerHTML = '';
  chips.forEach(([val, txt]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'filtro-chip' + (val === categoriaActiva ? ' active' : '');
    b.setAttribute('aria-pressed', String(val === categoriaActiva));
    b.textContent = txt;
    b.addEventListener('click', () => filtrar(b, val));
    cont.appendChild(b);
  });
}

// ── Comercios que se repiten 3+ veces en el mes ──
function renderComercios() {
  const grupos = {};
  todosMovimientos.filter(m => m.tipo === 'gasto' && m.descripcion).forEach(m => {
    const k = m.descripcion.trim().toLowerCase();
    (grupos[k] = grupos[k] || { nombre: m.descripcion.trim(), n: 0, total: 0 });
    grupos[k].n++; grupos[k].total += importe(m);
  });
  const frecuentes = Object.values(grupos).filter(g => g.n >= 3).sort((a, b) => b.total - a.total).slice(0, 6);
  const cont = document.getElementById('comercios');
  cont.innerHTML = '';
  cont.hidden = !frecuentes.length;
  frecuentes.forEach(g => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'comercio';
    b.innerHTML = '<b></b><span></span>';
    b.querySelector('b').textContent = g.nombre;
    b.querySelector('span').textContent = `${g.n} veces · ${fmt(g.total)}`;
    b.addEventListener('click', () => { const i = document.getElementById('buscar'); i.value = g.nombre; i.dispatchEvent(new Event('input')); });
    cont.appendChild(b);
  });
}

// ── Lista agrupada por día, con búsqueda, filtros, insignias y deslizar ──
function renderLista() {
  const lista = document.getElementById('lista');
  const q = (document.getElementById('buscar').value || '').trim().toLowerCase();
  const qNum = q.replace(',', '.');
  let filtrados = todosMovimientos.filter(m => !pendienteBorrado || m !== pendienteBorrado.m);
  if (categoriaActiva === 'ingresos') filtrados = filtrados.filter(m => m.tipo === 'ingreso');
  else if (categoriaActiva === 'gastos') filtrados = filtrados.filter(m => m.tipo === 'gasto');
  else if (categoriaActiva === 'fijos') filtrados = filtrados.filter(m => m.tipo === 'fijo');
  else if (categoriaActiva !== 'todas') filtrados = filtrados.filter(m => esGasto(m) && m.categoria === categoriaActiva);
  if (q) filtrados = filtrados.filter(m =>
    (m.descripcion || m.concepto || '').toLowerCase().includes(q) ||
    (m.categoria || '').toLowerCase().includes(q) ||
    (qNum && /^[\d.]+$/.test(qNum) && importe(m).toFixed(2).includes(qNum)));
  filtradosActuales = filtrados;

  if (!filtrados.length) {
    const hayAlgo = todosMovimientos.length > 0;
    lista.innerHTML = `<div class="vacio">${SVG('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>')}
      <b>${hayAlgo ? 'Nada coincide' : 'Sin movimientos este mes'}</b>
      <span>${hayAlgo ? 'Prueba con otra búsqueda o quita el filtro.' : 'Añade un gasto o importa el extracto de tu banco.'}</span>
      ${hayAlgo ? '' : '<button type="button" id="vacio-anadir">Añadir el primero</button>'}</div>`;
    const btn = document.getElementById('vacio-anadir');
    if (btn) btn.addEventListener('click', () => { document.querySelector('.mf-plus')?.click(); });
    return;
  }

  // Media por categoría para la insignia "Inusual"
  const media = {};
  todosMovimientos.filter(m => m.tipo === 'gasto' && m.categoria).forEach(m => {
    (media[m.categoria] = media[m.categoria] || { s: 0, n: 0 }); media[m.categoria].s += importe(m); media[m.categoria].n++;
  });

  const grupos = {};
  filtrados.forEach((m, idx) => { (grupos[m.fecha] = grupos[m.fecha] || []).push({ m, idx }); });
  const hoy  = new Date().toISOString().split('T')[0];
  const ayer = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  const mesesAbr = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  lista.innerHTML = '';
  let n = 0;
  Object.entries(grupos).forEach(([fecha, entries]) => {
    const grupo = document.createElement('div');
    grupo.className = 'dia-grupo'; grupo.dataset.fecha = fecha;
    const f = new Date(fecha + 'T00:00:00');
    const neto = entries.reduce((t, { m }) => t + (m.tipo === 'ingreso' ? importe(m) : -importe(m)), 0);
    const label = document.createElement('div');
    label.className = 'dia-label';
    label.innerHTML = `<span>${fecha === hoy ? 'HOY' : fecha === ayer ? 'AYER' : (dias[f.getDay()] + ', ' + f.getDate() + ' ' + mesesAbr[f.getMonth()]).toUpperCase()}</span><span class="dia-total">${neto > 0 ? '+' : ''}${fmt(neto)}</span>`;
    grupo.appendChild(label);
    entries.forEach(({ m, idx }) => {
      const esFijo = m.tipo === 'fijo', esIngreso = m.tipo === 'ingreso';
      const fila = document.createElement('div');
      fila.className = 'fila';
      if (n < 12) fila.style.animationDelay = (n * 40) + 'ms'; else fila.style.animation = 'none';
      n++;
      const icon = esIngreso ? '💰' : esFijo ? '🔃' : getIcon(m.categoria);
      const med = media[m.categoria];
      const inusual = m.tipo === 'gasto' && med && med.n >= 3 && importe(m) > 2 * (med.s / med.n);
      const ins = [
        esFijo ? '<span class="insignia ins-fijo">Fijo</span>' : '',
        m.origen === 'importado' ? '<span class="insignia ins-imp">Importado</span>' : '',
        inusual ? '<span class="insignia ins-inusual">Inusual</span>' : '',
      ].join('');
      fila.innerHTML = `
        <div class="fila-acciones" aria-hidden="true">
          <button type="button" class="acc-editar" tabindex="-1">${SVG('<path d="M4 20h4L19 9l-4-4L4 16Z"/>')}Editar</button>
          <button type="button" class="acc-borrar" tabindex="-1">${SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>')}Eliminar</button>
        </div>
        <button type="button" class="movimiento" data-idx="${idx}">
          <div class="mov-icon ${esIngreso ? 'ingreso' : esFijo ? 'fijo' : ''}" aria-hidden="true">${icon}</div>
          <div class="mov-info">
            <div class="mov-desc"></div>
            <div class="mov-cat"><span class="mov-cat-txt"></span>${ins}</div>
          </div>
          <div class="mov-right"><div class="mov-amount ${esIngreso ? 'amount-ingreso' : 'amount-gasto'}">${esIngreso ? '+' : ''}${fmt(esIngreso ? importe(m) : -importe(m))}</div></div>
        </button>`;
      fila.querySelector('.mov-desc').textContent = m.descripcion || m.concepto || '';
      fila.querySelector('.mov-cat-txt').textContent = sinEmoji(m.categoria) || (esIngreso ? 'Ingreso' : '');
      prepararFila(fila, m);
      grupo.appendChild(fila);
    });
    lista.appendChild(grupo);
  });
}

// ── Deslizar: izquierda muestra Eliminar, derecha muestra Editar ──
let filaAbierta = null;
function prepararFila(fila, m) {
  const btn = fila.querySelector('.movimiento');
  const [accEditar, accBorrar] = fila.querySelectorAll('.fila-acciones button');
  let x0 = 0, y0 = 0, dx = 0, activo = false, horizontal = null, base = 0;
  const mover = x => { btn.style.transform = x ? `translateX(${x}px)` : ''; };
  const cerrar = () => { mover(0); base = 0; if (filaAbierta === fila) filaAbierta = null; };
  btn.addEventListener('pointerdown', e => {
    if (filaAbierta && filaAbierta !== fila) filaAbierta._cerrar();
    x0 = e.clientX; y0 = e.clientY; dx = 0; activo = true; horizontal = null;
  });
  btn.addEventListener('pointermove', e => {
    if (!activo) return;
    const ddx = e.clientX - x0, ddy = e.clientY - y0;
    if (horizontal === null && (Math.abs(ddx) > 8 || Math.abs(ddy) > 8)) horizontal = Math.abs(ddx) > Math.abs(ddy);
    if (!horizontal) return;
    btn.classList.add('arrastrando');
    dx = Math.max(-110, Math.min(110, base + ddx));
    mover(dx);
  });
  const soltar = () => {
    if (!activo) return;
    activo = false; btn.classList.remove('arrastrando');
    if (!horizontal) return;
    if (dx < -60) { mover(-96); base = -96; filaAbierta = fila; if (navigator.vibrate) navigator.vibrate(10); }
    else if (dx > 60) { mover(96); base = 96; filaAbierta = fila; if (navigator.vibrate) navigator.vibrate(10); }
    else cerrar();
  };
  btn.addEventListener('pointerup', soltar);
  btn.addEventListener('pointercancel', soltar);
  btn.addEventListener('click', e => {
    if (horizontal) { horizontal = null; e.preventDefault(); return; }  // fue un deslizamiento, no un toque
    if (base) { cerrar(); return; }
    abrirDetalle(m);
  });
  fila._cerrar = cerrar;
  accEditar.addEventListener('click', () => { cerrar(); abrirEditar(m); });
  accBorrar.addEventListener('click', () => borrarConDeshacer(m));
}

// ── Borrar con opción de deshacer (5 s) ──
let pendienteBorrado = null;
function borrarConDeshacer(m) {
  if (pendienteBorrado) confirmarBorrado();
  if (navigator.vibrate) navigator.vibrate(10);
  pendienteBorrado = { m, timer: setTimeout(confirmarBorrado, 5000) };
  document.getElementById('deshacer-txt').textContent = m.tipo === 'fijo' ? 'Gasto fijo eliminado' : 'Movimiento eliminado';
  document.getElementById('deshacer').classList.add('show');
  renderLista();
}
function deshacerBorrado() {
  if (!pendienteBorrado) return;
  clearTimeout(pendienteBorrado.timer);
  pendienteBorrado = null;
  document.getElementById('deshacer').classList.remove('show');
  renderLista();
}
// Misma consulta de borrado que eliminarMovimiento(), ejecutada al acabar la cuenta atrás
async function confirmarBorrado() {
  if (!pendienteBorrado) return;
  const { m, timer } = pendienteBorrado;
  clearTimeout(timer);
  pendienteBorrado = null;
  document.getElementById('deshacer').classList.remove('show');
  const tabla = m.tipo === 'ingreso' ? 'ingresos' : m.tipo === 'fijo' ? 'gastos_fijos' : 'gastos';
  const { error } = await dbClient.from(tabla).delete().eq('id', m.id).eq('usuario_id', window.currentUserId);
  if (error) { alert('Error: ' + error.message); }
  cargarMovimientos();
}
// Si se sale de la pantalla durante la cuenta atrás, el borrado se completa
window.addEventListener('pagehide', () => { if (pendienteBorrado) confirmarBorrado(); });

// ── Hoja de detalle ──
let enDetalle = null;
function abrirDetalle(m) {
  enDetalle = m;
  const esIngreso = m.tipo === 'ingreso';
  document.getElementById('det-desc').textContent = m.descripcion || m.concepto || '';
  const imp = document.getElementById('det-importe');
  imp.textContent = (esIngreso ? '+' : '') + fmt(esIngreso ? importe(m) : -importe(m));
  imp.style.color = esIngreso ? 'var(--green-txt)' : 'var(--red-txt)';
  const f = new Date(m.fecha + 'T00:00:00');
  const fechaTxt = f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const meta = document.getElementById('det-meta');
  meta.innerHTML = '';
  [getIcon(m.categoria) + ' ' + (sinEmoji(m.categoria) || (esIngreso ? 'Ingreso' : '—')), fechaTxt, m.tipo === 'fijo' ? 'Gasto fijo' : m.origen === 'importado' ? 'Importado' : 'Añadido a mano']
    .forEach((t, i) => { const sp = document.createElement('span'); sp.textContent = (i ? '· ' : '') + t; meta.appendChild(sp); });
  const mismos = todosMovimientos.filter(x => x.tipo === m.tipo && x.categoria === m.categoria);
  const total = mismos.reduce((t, x) => t + importe(x), 0);
  const ctx = document.getElementById('det-contexto');
  ctx.textContent = m.categoria
    ? `Este mes llevas ${fmt(total)} en ${sinEmoji(m.categoria)} (${mismos.length} ${mismos.length === 1 ? 'movimiento' : 'movimientos'}).`
    : `Este mes llevas ${mismos.length} ${mismos.length === 1 ? 'movimiento' : 'movimientos'} de este tipo.`;
  document.getElementById('det-repetir').hidden = m.tipo === 'fijo';
  document.getElementById('modal-detalle').style.display = 'flex';
}
function cerrarDetalle() { document.getElementById('modal-detalle').style.display = 'none'; }
function detalleEditar() { const m = enDetalle; cerrarDetalle(); if (m) abrirEditar(m); }
function detalleEliminar() { const m = enDetalle; cerrarDetalle(); if (m) borrarConDeshacer(m); }
// Repetir: abre la hoja rápida (apunte.js) con los mismos datos y la fecha de hoy
function detalleRepetir() {
  const m = enDetalle; cerrarDetalle();
  if (!m || !window.mfApunte) return;
  window.mfApunte.abrir(m.tipo === 'ingreso' ? 'ingreso' : 'gasto', { monto: +m.monto, descripcion: m.concepto || m.descripcion || '', categoria: m.categoria });
}
document.getElementById('modal-detalle').addEventListener('click', function (e) { if (e.target === this) cerrarDetalle(); });

// ── Búsqueda ──
;(function () {
  const input = document.getElementById('buscar'), limpiar = document.getElementById('buscar-limpiar');
  input.addEventListener('input', () => { limpiar.hidden = !input.value; renderLista(); });
  limpiar.addEventListener('click', () => { input.value = ''; limpiar.hidden = true; renderLista(); input.focus(); });
})();

const hoy = new Date().toISOString().split('T')[0];


function abrirBorrarTodo() {

  document.getElementById('modal-borrar-1').style.display = 'flex';
}
function cerrarBorrar() {
  document.getElementById('modal-borrar-1').style.display = 'none';
  document.getElementById('modal-borrar-2').style.display = 'none';
  document.getElementById('borrar-confirmar-input').value = '';
  actualizarBtnBorrar();
}
function continuarBorrar() {
  document.getElementById('modal-borrar-1').style.display = 'none';
  document.getElementById('borrar-confirmar-input').value = '';
  actualizarBtnBorrar();
  document.getElementById('modal-borrar-2').style.display = 'flex';
}
function actualizarBtnBorrar() {
  const val = document.getElementById('borrar-confirmar-input').value;
  const btn = document.getElementById('borrar-btn-ok');
  const ok = val === 'CONFIRMAR';
  btn.style.opacity = ok ? '1' : '0.4';
  btn.style.pointerEvents = ok ? 'auto' : 'none';
}
async function ejecutarBorrarTodo() {
  if (document.getElementById('borrar-confirmar-input').value !== 'CONFIRMAR') return;
  cerrarBorrar();
  const uid = window.currentUserId;
  if (!uid) { mostrarToast('No se pudo identificar el usuario'); return; }
  toast('Eliminando movimientos…', '');
  try {
    const [r1, r2, r3] = await Promise.all([
      dbClient.from('gastos').delete().eq('usuario_id', uid),
      dbClient.from('ingresos').delete().eq('usuario_id', uid),
      dbClient.from('gastos_fijos').delete().eq('usuario_id', uid)
    ]);
    if (r1.error || r2.error || r3.error) throw new Error('Error en Supabase');
    toast('✅ Todos los movimientos eliminados');
    cargarMovimientos();
  } catch (e) {
    toast('❌ Error al eliminar: ' + e.message, '');
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const _MESES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
function fmtFechaCorta(s) {
  const p = (s || '').split('-');
  if (p.length < 3) return s;
  return parseInt(p[2]) + ' ' + (_MESES[parseInt(p[1]) - 1] || '');
}

function abrirRevisionVoz(movimientos) {
  const categorias = categoriasPerfil;
  const ci = 'background:#0a0e1a;border:1px solid #263248;border-radius:8px;padding:6px 8px;color:#f1f5f9;font-size:13px;font-family:\'Manrope\',sans-serif;outline:none;box-sizing:border-box;';
  const cont = document.getElementById('revision-voz-lista');
  cont.innerHTML = movimientos.map((g, i) => {
    const esIngreso = g.tipo === 'ingreso';
    const catMatch = categorias.includes(g.categoria) ? g.categoria : '📦 Otros';
    const opts = categorias.map(c => `<option ${c === catMatch ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
    const sep = i < movimientos.length - 1 ? 'border-bottom:1px solid #263248;' : '';
    const rowAccent = esIngreso ? 'border-left:3px solid #10b981;padding-left:7px;' : 'border-left:3px solid #ef4444;padding-left:7px;';
    return `<div class="revision-item" style="padding:10px 0;${sep}${rowAccent}display:flex;gap:8px;align-items:center;">
      <span style="flex-shrink:0;width:20px;font-size:13px;color:#484f58;text-align:right;line-height:1;">${i + 1}</span>
      <div style="flex:1;min-width:0;">
      <div style="display:flex;gap:6px;margin-bottom:6px;">
        <textarea class="rv-descripcion"
          style="${ci}flex:1;min-width:0;height:36px;font-size:16px;resize:none;overflow:hidden;line-height:1.4;transition:height 0.15s;"
          placeholder="Descripción"
          onfocus="this.style.height='90px';this.style.overflowY='auto';"
          onblur="this.style.height='36px';this.style.overflowY='hidden';"
        >${escapeHtml(g.descripcion)}</textarea>
        <select class="rv-categoria" style="${ci}width:140px;flex-shrink:0;min-height:44px;font-size:16px;">${opts}</select>
        <input type="number" class="rv-monto" style="${ci}width:68px;flex-shrink:0;" value="${g.monto ?? ''}" placeholder="0">
      </div>
      <div style="display:flex;gap:6px;align-items:center;">
        <span style="display:inline-flex;width:115px;flex-shrink:0;">
          <input type="hidden" class="rv-fecha" value="${g.fecha || hoy}">
          <button type="button" class="inp dp-btn" style="${ci}width:115px;padding:6px 8px;min-height:38px;font-size:13px;" onclick="openDatePickerEl(this.previousElementSibling)"><span class="dp-txt">${window._dpFmt ? window._dpFmt(g.fecha || hoy) : (g.fecha || hoy)}</span><svg class="dp-cal-icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;"><rect x="2" y="3" width="16" height="15" rx="2"/><path d="M2 8h16M7 1v4M13 1v4"/></svg></button>
        </span>
        <select class="rv-tipo" style="${ci}width:90px;flex-shrink:0;">
          <option value="gasto" ${!esIngreso ? 'selected' : ''}>Gasto</option>
          <option value="ingreso" ${esIngreso ? 'selected' : ''}>Ingreso</option>
        </select>
        <div style="flex:1;"></div>
        <button onclick="this.closest('.revision-item').remove();actualizarContadorRevision();" style="background:none;border:none;color:#ef4444;font-size:16px;cursor:pointer;padding:4px 6px;line-height:1;flex-shrink:0;">✕</button>
      </div>
      </div>
    </div>`;
  }).join('');
  const fmt = n => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
  const gastosArr   = movimientos.filter(m => m.tipo !== 'ingreso');
  const ingresosArr = movimientos.filter(m => m.tipo === 'ingreso');
  const sumGastos   = gastosArr.reduce((a, m) => a + (parseFloat(m.monto) || 0), 0);
  const sumIngresos = ingresosArr.reduce((a, m) => a + (parseFloat(m.monto) || 0), 0);
  const resEl = document.getElementById('revision-resumen');
  resEl.innerHTML = `Se encontraron <strong>${movimientos.length}</strong> movimiento${movimientos.length !== 1 ? 's' : ''}: ` +
    (gastosArr.length   ? `<span style="color:#ef4444;font-weight:600;">${gastosArr.length} gasto${gastosArr.length !== 1 ? 's' : ''} (${fmt(sumGastos)})</span>` : '') +
    (gastosArr.length && ingresosArr.length ? ' y ' : '') +
    (ingresosArr.length ? `<span style="color:#10b981;font-weight:600;">${ingresosArr.length} ingreso${ingresosArr.length !== 1 ? 's' : ''} (${fmt(sumIngresos)})</span>` : '') +
    '.';
  actualizarContadorRevision();
  document.getElementById('modal-revision-voz').style.display = 'flex';
  marcarFijosRepetidos(movimientos);
}

// Al importar el banco, el alquiler (o cualquier fijo) vendría otra vez en el extracto y se
// contaría dos veces. Esos movimientos se marcan y no se guardan, salvo que el usuario lo pida.
async function marcarFijosRepetidos(movimientos) {
  const fechas = movimientos.map(m => m.fecha).filter(Boolean).sort();
  if (!fechas.length) return;
  const { data: fijos } = await dbClient.from('gastos_fijos').select('nombre, categoria, monto, fecha_inicio, fecha_fin')
    .eq('usuario_id', window.currentUserId).lte('fecha_inicio', fechas[fechas.length - 1]).or(`fecha_fin.gte.${fechas[0]},fecha_fin.is.null`);
  if (!fijos?.length) return;
  const palabras = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(p => p.length >= 3);
  const parecido = (a, b) => { const pb = new Set(palabras(b)); return palabras(a).some(p => pb.has(p)); };
  const items = document.querySelectorAll('#revision-voz-lista .revision-item');
  let n = 0;
  movimientos.forEach((m, i) => {
    if (m.tipo === 'ingreso' || !m.fecha || !items[i]) return;
    const mes = m.fecha.slice(0, 7), monto = parseFloat(m.monto) || 0;
    const f = fijos.find(f => f.fecha_inicio.slice(0, 7) <= mes && (!f.fecha_fin || f.fecha_fin.slice(0, 7) >= mes)
      && Math.abs(monto - f.monto) <= Math.max(1, f.monto * 0.03) && (m.categoria === f.categoria || parecido(m.descripcion, f.nombre)));
    if (!f) return;
    n++;
    const item = items[i];
    item.dataset.fijo = '1';
    const campos = item.querySelectorAll('textarea, select, input, .dp-btn');
    campos.forEach(c => { c.style.opacity = '.45'; });
    const nota = document.createElement('div');
    nota.style.cssText = 'margin-top:6px;font-size:12.5px;color:#a5b4fc;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    nota.innerHTML = `<span>↻ Ya está en tu gasto fijo «${escapeHtml(f.nombre)}»: no se guardará</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Guardar igualmente';
    btn.style.cssText = 'background:none;border:1px solid #263248;border-radius:99px;color:#f1f5f9;font:700 12px Manrope,sans-serif;padding:4px 10px;cursor:pointer';
    btn.onclick = () => { delete item.dataset.fijo; campos.forEach(c => { c.style.opacity = ''; }); nota.remove(); };
    nota.appendChild(btn);
    item.querySelector('div[style*="flex:1;min-width:0"]').appendChild(nota);
  });
  if (n) document.getElementById('revision-resumen').insertAdjacentHTML('beforeend',
    ` <span style="color:#a5b4fc;font-weight:600;">${n} ya ${n === 1 ? 'está' : 'están'} en tus gastos fijos y no se ${n === 1 ? 'guardará' : 'guardarán'}.</span>`);
}

function actualizarContadorRevision() {
  const n = document.querySelectorAll('#revision-voz-lista .revision-item').length;
  document.getElementById('revision-voz-titulo').textContent = n ? `${n} movimiento${n === 1 ? '' : 's'} detectado${n === 1 ? '' : 's'}` : 'Sin movimientos';
}

function cerrarRevisionVoz() {
  document.getElementById('modal-revision-voz').style.display = 'none';
}

let _pendingCsvText = null;

function parseCodigosUsados(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return val.split(',').filter(Boolean);
}

async function guardarRevisionVoz() {
  const items = Array.from(document.querySelectorAll('#revision-voz-lista .revision-item'));
  if (!items.length) { alert('No hay movimientos para guardar'); return; }

  const uid = window.currentUserId;

  // ── Comprobar premium y límite de importación ──────────────────────────
  const { data: perfilRows } = await dbClient.from('perfil').select('premium, codigos_usados, limite_importacion').eq('usuario_id', uid).limit(1);
  const perfilRow    = perfilRows?.[0] || {};
  const isPremium    = perfilRow.premium === true;
  const codigosUsados = parseCodigosUsados(perfilRow.codigos_usados);
  // Límite base 200 + 200 por cada código de desbloqueo aplicado
  const LIMITE_BASE  = perfilRow.limite_importacion ?? 200;
  const limiteTotal  = LIMITE_BASE + codigosUsados.length * 200;

  // ── Construir listas de movimientos válidos ────────────────────────────
  const gastos = [], ingresos = [];

  for (const item of items) {
    if (item.dataset.fijo === '1') continue;  // ya lo cuenta su gasto fijo
    const fecha       = item.querySelector('.rv-fecha').value || hoy;
    const descripcion = item.querySelector('.rv-descripcion').value.trim();
    const categoria   = item.querySelector('.rv-categoria').value;
    const monto       = parseFloat(item.querySelector('.rv-monto').value);
    const tipoSelect  = item.querySelector('.rv-tipo');
    const tipo        = tipoSelect ? tipoSelect.value : 'gasto';
    if (!descripcion || isNaN(monto)) continue;

    if (tipo === 'ingreso') {
      ingresos.push({ fecha, concepto: descripcion, tipo: categoria, monto, usuario_id: uid, origen: 'importado' });
    } else {
      gastos.push({ fecha, descripcion, categoria, monto, usuario_id: uid, origen: 'importado' });
    }
  }

  if (!gastos.length && !ingresos.length) {
    alert('Completa al menos un movimiento válido (descripción y monto)');
    return;
  }

  // ── Verificar si los nuevos superan el límite acumulado ────────────────
  if (!isPremium) {
    const totalNuevos = gastos.length + ingresos.length;
    const [resG, resI] = await Promise.all([
      dbClient.from('gastos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado'),
      dbClient.from('ingresos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado')
    ]);
    const totalImportados = (resG.count ?? 0) + (resI.count ?? 0);
    if (totalImportados + totalNuevos > limiteTotal) {
      document.getElementById('modal-limite-premium').style.display = 'flex';
      return;
    }
  }

  const ops = [];
  console.log('Insertando gastos:', JSON.stringify(gastos));
  console.log('Insertando ingresos:', JSON.stringify(ingresos));
  if (gastos.length)   ops.push(dbClient.from('gastos').insert(gastos));
  if (ingresos.length) ops.push(dbClient.from('ingresos').insert(ingresos));
  const resultados = await Promise.all(ops);
  const errOp = resultados.find(r => r.error);
  if (errOp) { alert('Error: ' + errOp.error.message); return; }

  cerrarRevisionVoz();
  const total = gastos.length + ingresos.length;
  const partesSaved = [];
  if (gastos.length)   partesSaved.push(`${gastos.length} gasto${gastos.length !== 1 ? 's' : ''}`);
  if (ingresos.length) partesSaved.push(`${ingresos.length} ingreso${ingresos.length !== 1 ? 's' : ''}`);
  toast(`✅ Guardados: ${partesSaved.join(' + ')} (${total} total)`);
  cargarMovimientos();
}

async function aplicarCodigo() {
  const input    = document.getElementById('codigo-input');
  const feedback = document.getElementById('codigo-feedback');
  const codigo   = input.value.trim().toUpperCase();
  feedback.textContent = '';

  const CODIGOS_VALIDOS = ['CARLOS', 'CARLOS2', 'CARLOS3'];
  if (!CODIGOS_VALIDOS.includes(codigo)) {
    feedback.style.color = '#ef4444';
    feedback.textContent = 'Código no válido';
    return;
  }

  const uid = window.currentUserId;
  const { data: perfilRows } = await dbClient.from('perfil').select('id, codigos_usados, limite_importacion').eq('usuario_id', uid).limit(1);
  const perfilRow = perfilRows?.[0];
  const usados = parseCodigosUsados(perfilRow?.codigos_usados);
  const limiteBase = perfilRow?.limite_importacion ?? 200;

  if (usados.includes(codigo)) {
    feedback.style.color = '#ef4444';
    feedback.textContent = 'Este código ya fue utilizado';
    return;
  }

  const nuevosUsados = [...usados, codigo];
  let err;
  if (perfilRow?.id) {
    ({ error: err } = await dbClient.from('perfil').update({ codigos_usados: nuevosUsados }).eq('id', perfilRow.id));
  } else {
    ({ error: err } = await dbClient.from('perfil').insert({ usuario_id: uid, codigos_usados: nuevosUsados }));
  }
  if (err) {
    feedback.style.color = '#ef4444';
    feedback.textContent = 'Error al guardar el código: ' + err.message;
    return;
  }

  input.value = '';
  feedback.style.color = '#4ade80';
  feedback.textContent = '¡Límite ampliado! Ya puedes importar 200 movimientos más';

  if (_pendingCsvText) {
    const nuevoLimite = limiteBase + nuevosUsados.length * 200;
    const filasCsv = _pendingCsvText.split(/\r?\n/).filter((l, i) => i > 0 && l.trim()).length;
    const [resG, resI] = await Promise.all([
      dbClient.from('gastos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado'),
      dbClient.from('ingresos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado')
    ]);
    const totalImportados = (resG.count ?? 0) + (resI.count ?? 0);
    if (totalImportados + filasCsv <= nuevoLimite) {
      document.getElementById('btn-continuar-importacion').style.display = 'block';
    }
  }
  actualizarModalLimite();
}

async function actualizarModalLimite() {
  const uid = window.currentUserId;
  if (!uid) return;
  const TODOS_CODIGOS = ['CARLOS', 'CARLOS2', 'CARLOS3'];
  const { data: perfilRows } = await dbClient.from('perfil').select('codigos_usados').eq('usuario_id', uid).limit(1);
  const usados = parseCodigosUsados(perfilRows?.[0]?.codigos_usados);
  const agotados = TODOS_CODIGOS.every(c => usados.includes(c));
  document.getElementById('codigo-wrap').style.display = agotados ? 'none' : 'block';
}

function cerrarModalLimite() {
  document.getElementById('modal-limite-premium').style.display = 'none';
  document.getElementById('btn-continuar-importacion').style.display = 'none';
  document.getElementById('codigo-wrap').style.display = 'block';
  document.getElementById('codigo-feedback').textContent = '';
  document.getElementById('codigo-input').value = '';
}

async function continuarImportacion() {
  const csvText = _pendingCsvText;
  _pendingCsvText = null;
  document.getElementById('modal-limite-premium').style.display = 'none';
  document.getElementById('btn-continuar-importacion').style.display = 'none';
  document.getElementById('codigo-feedback').textContent = '';
  document.getElementById('codigo-input').value = '';

  try {
    const { data: { session } } = await dbClient.auth.getSession();
    const token = session?.access_token;
    if (!token) { alert('Sesión expirada, vuelve a iniciar sesión.'); return; }

    await cargarCategoriasPerfil();
    const categorias = categoriasPerfil;
    const resp = await fetch('/.netlify/functions/import-csv', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ csv: csvText, categorias })
    });
    let datos;
    if (!resp.ok) {
      datos = await resp.json().catch(() => ({}));
      const dbgTxt = datos.dbg ? '\n\n─── DEBUG ───\n' + JSON.stringify(datos.dbg, null, 2) : '';
      alert('❌ ' + (datos.error || 'Error del servidor') + dbgTxt);
      return;
    }
    datos = await resp.json();
    let movimientos = Array.isArray(datos.movimientos) && datos.movimientos.length
      ? datos.movimientos
      : Array.isArray(datos.gastos)
        ? datos.gastos.map(g => ({ ...g, tipo: g.tipo || 'gasto' }))
        : [];
    if (!movimientos.length) {
      alert('❌ No se encontraron movimientos en el archivo');
      return;
    }
    abrirRevisionVoz(movimientos);
  } catch (err) {
    alert('❌ ' + err.message);
  }
}



function mostrarErrorFecha(prefix) {
  document.getElementById(prefix + '-fecha').classList.add('inp-error');
  document.getElementById(prefix + '-fecha-error').style.display = 'block';
}

function ocultarErrorFecha(prefix) {
  document.getElementById(prefix + '-fecha').classList.remove('inp-error');
  document.getElementById(prefix + '-fecha-error').style.display = 'none';
}


let editando = null;

async function abrirEditar(m) {
  editando = m;
  const esFijo    = m.tipo === 'fijo';
  const esIngreso = m.tipo === 'ingreso';
  await cargarCategoriasPerfil();
  document.getElementById('edit-title').textContent = esFijo ? 'Editar gasto fijo' : esIngreso ? 'Editar ingreso' : 'Editar gasto';
  document.getElementById('edit-btn-ok').style.background = esFijo ? '#6366f1' : esIngreso ? '#10b981' : '#ef4444';
  document.getElementById('edit-btn-ok').style.color = esFijo ? '#fff' : '#0a0e1a';
  document.getElementById('lbl-e-fecha').textContent = esFijo ? 'Fecha de inicio' : 'Fecha';
  document.getElementById('e-fecha-error').textContent = esFijo ? 'La fecha de inicio es obligatoria' : 'La fecha es obligatoria';
  ocultarErrorFecha('e');
  document.getElementById('e-fecha').value = esFijo ? (m.fecha_inicio || m.fecha || '').slice(0, 10) : (m.fecha || '').slice(0, 10);
  document.getElementById('e-monto').value = m.monto;
  document.getElementById('fld-descripcion').style.display = (!esFijo && !esIngreso) ? '' : 'none';
  document.getElementById('fld-concepto').style.display    = esIngreso ? '' : 'none';
  document.getElementById('fld-categoria').style.display   = (!esFijo && !esIngreso) ? '' : 'none';
  document.getElementById('fld-tipo').style.display        = esIngreso ? '' : 'none';
  document.getElementById('fld-nombre').style.display      = esFijo ? '' : 'none';
  document.getElementById('fld-cat-fijo').style.display    = esFijo ? '' : 'none';
  document.getElementById('fld-fecha-fin').style.display   = esFijo ? '' : 'none';
  if (esFijo) {
    document.getElementById('e-nombre').value    = m.nombre || '';
    document.getElementById('e-cat-fijo').value  = m.categoria;
    document.getElementById('e-fecha-fin').value = (m.fecha_fin || '').slice(0, 10);
  } else if (esIngreso) {
    document.getElementById('e-concepto').value = m.concepto || m.descripcion || '';
    const tipoSel = document.getElementById('e-tipo');
    [...tipoSel.options].forEach(o => { if (o.value === m.categoria) tipoSel.value = m.categoria; });
  } else {
    document.getElementById('e-descripcion').value = m.descripcion || '';
    const catSel = document.getElementById('e-categoria');
    [...catSel.options].forEach(o => { if (o.value === m.categoria) catSel.value = m.categoria; });
  }
  document.getElementById('modal-editar').style.display = 'flex';
}

function cerrarEditar() {
  document.getElementById('modal-editar').style.display = 'none';
  editando = null;
}

async function guardarEdicion() {
  if (!editando) return;
  const fechaVal = document.getElementById('e-fecha').value.trim();
  if (!fechaVal) { mostrarErrorFecha('e'); return; }
  ocultarErrorFecha('e');

  const fecha = fechaVal;
  const monto = parseFloat(document.getElementById('e-monto').value);
  if (isNaN(monto)) { alert('Completa todos los campos'); return; }
  let error;
  if (editando.tipo === 'fijo') {
    const nombre    = document.getElementById('e-nombre').value.trim();
    const categoria = document.getElementById('e-cat-fijo').value;
    if (!nombre) { alert('Completa el nombre'); return; }
    const fechaFin  = document.getElementById('e-fecha-fin').value || null;
    const dia = new Date(fecha + 'T00:00:00').getDate();
    ({ error } = await dbClient.from('gastos_fijos').update({ nombre, categoria, monto, fecha_inicio: fecha, fecha_fin: fechaFin, dia_del_mes: dia }).eq('id', editando.id).eq('usuario_id', window.currentUserId));
  } else if (editando.tipo === 'ingreso') {
    const concepto = document.getElementById('e-concepto').value.trim();
    const tipo     = document.getElementById('e-tipo').value;
    if (!concepto) { alert('Completa el concepto'); return; }
    ({ error } = await dbClient.from('ingresos').update({ fecha, concepto, tipo, monto }).eq('id', editando.id).eq('usuario_id', window.currentUserId));
  } else {
    const descripcion = document.getElementById('e-descripcion').value.trim();
    const categoria   = document.getElementById('e-categoria').value;
    if (!descripcion) { alert('Completa la descripción'); return; }
    ({ error } = await dbClient.from('gastos').update({ fecha, descripcion, categoria, monto }).eq('id', editando.id).eq('usuario_id', window.currentUserId));
  }
  if (error) { alert('Error: ' + error.message); return; }
  cerrarEditar();
  cargarMovimientos();
}

async function eliminarMovimiento() {
  if (!editando) return;
  const msg = editando.tipo === 'fijo' ? '¿Eliminar este gasto fijo? El historial quedará guardado.' : '¿Eliminar este movimiento?';
  if (!confirm(msg)) return;
  const tabla = editando.tipo === 'ingreso' ? 'ingresos' : editando.tipo === 'fijo' ? 'gastos_fijos' : 'gastos';
  const { error } = await dbClient.from(tabla).delete().eq('id', editando.id).eq('usuario_id', window.currentUserId);
  if (error) { alert('Error: ' + error.message); return; }
  cerrarEditar();
  cargarMovimientos();
}

function abrirEditarIdx(idx) {
  const m = filtradosActuales[idx];
  if (m) abrirEditar(m);
}

actualizarMesLabel();

document.getElementById('e-fecha').addEventListener('input', () => ocultarErrorFecha('e'));

const CATS_DEFAULT = MF.CATS_DEFAULT
// Categorías del usuario ordenadas; las usan la edición y la revisión de la importación
const ordenCat = s => s.replace(/^[^\p{L}]+/u, '').toLowerCase()
let categoriasPerfil = CATS_DEFAULT.split(',').sort((a, b) => ordenCat(a).localeCompare(ordenCat(b), 'es'))

async function cargarCategoriasPerfil() {
  const uid = window.currentUserId;
  if (!uid) return;
  const { data: rows } = await dbClient.from('perfil').select('categorias').eq('usuario_id', uid).limit(1);
  const catsStr = rows?.[0]?.categorias || CATS_DEFAULT;
  const cats = [...new Set(catsStr.split(',').map(c => c.trim()).filter(Boolean))];
  const defaults = CATS_DEFAULT.split(',').map(c => c.trim());
  const allCats = cats.concat(defaults.filter(d => !cats.includes(d)));
  allCats.sort((a, b) => ordenCat(a).localeCompare(ordenCat(b), 'es'));
  categoriasPerfil = allCats;
  ['e-categoria', 'e-cat-fijo'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = allCats.map(c => `<option>${c}</option>`).join('');
  });
}

function toast(msg, tipo = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${tipo} show`;
  setTimeout(() => { t.className = 'toast'; }, 2500);
}










async function abrirImportarCSV() {

  document.getElementById('csv-estado').textContent = 'Selecciona el extracto de tu banco (CSV, XLS o XLSX). La app detectará los movimientos automáticamente — revisa las categorías antes de guardar.';
  document.getElementById('csv-btn-seleccionar').style.display = 'block';
  document.getElementById('csv-file').value = '';
  document.getElementById('modal-csv').style.display = 'flex';

  const wrap = document.getElementById('csv-uso-wrap');
  const texto = document.getElementById('csv-uso-texto');
  const barra = document.getElementById('csv-uso-barra');
  wrap.style.display = 'none';
  try {
    const uid = window.currentUserId;
    if (!uid) return;
    const [resG, resI] = await Promise.all([
      dbClient.from('gastos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado'),
      dbClient.from('ingresos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado')
    ]);
    const total = (resG.count ?? 0) + (resI.count ?? 0);
    const limite = 200;
    const pct = Math.min((total / limite) * 100, 100);
    const color = pct >= 90 ? '#ef4444' : pct >= 75 ? '#f0a030' : '#4ade80';
    texto.textContent = `${total} / ${limite}`;
    texto.style.color = color;
    barra.style.width = pct + '%';
    barra.style.background = color;
    wrap.style.display = 'block';
  } catch (_) {}
}

function cerrarCSV() {
  document.getElementById('modal-csv').style.display = 'none';
}

// Repara mojibake Windows-1252→UTF-8: ocurre cuando iOS Numbers abre un CSV
// UTF-8 con emoji y lo guarda como XLSX sin preservar la codificación.
// Si algún carácter no es mapeable o el resultado no es UTF-8 válido, devuelve null.
function fixarMojibake(str) {
  const w2b = {
    0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,
    0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,
    0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,
    0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
    0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,
    0x017E:0x9E,0x0178:0x9F
  };
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const cp = str.charCodeAt(i);
    if (cp <= 0xFF) { bytes[i] = cp; continue; }
    const b = w2b[cp];
    if (b !== undefined) { bytes[i] = b; continue; }
    return null;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch { return null; }
}

// Lector de Excel (unos 300 KB): solo se descarga al importar un .xls o .xlsx
const XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

async function fileToCSV(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'xls' || ext === 'xlsx') {
    let XLSX;
    try { XLSX = await MF.cargarScript(XLSX_URL, () => window.XLSX); }
    catch { throw new Error('No se pudo abrir el lector de Excel. Comprueba tu conexión e inténtalo de nuevo.'); }
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    let csv = XLSX.utils.sheet_to_csv(ws);
    // Detectar mojibake por patrones típicos (BOM garbled, emoji garbled)
    const primerLinea = csv.slice(0, 200);
    if (/ï»¿|ðŸ|Ã[¡-ÿ]/.test(primerLinea)) {
      const fixed = fixarMojibake(csv);
      if (fixed) csv = fixed;
    }
    return csv;
  }
  return file.text();
}

async function procesarArchivoCSV(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('csv-btn-seleccionar').style.display = 'none';
  document.getElementById('csv-estado').textContent = `📄 ${file.name}\n\nAnalizando tus movimientos...`;
  try {
    const csvText = await fileToCSV(file);

    // ── Chequeo de límite antes de llamar a la IA ──────────────────────────
    const uid = window.currentUserId;
    const { data: perfilRowsCSV } = await dbClient.from('perfil').select('premium, codigos_usados, limite_importacion').eq('usuario_id', uid).limit(1);
    const perfilRowCSV   = perfilRowsCSV?.[0] || {};
    const isPremiumCSV   = perfilRowCSV.premium === true;
    const codigosCSV     = parseCodigosUsados(perfilRowCSV.codigos_usados);
    const limiteBaseCSV  = perfilRowCSV.limite_importacion ?? 200;
    const limiteTotalCSV = limiteBaseCSV + codigosCSV.length * 200;

    if (!isPremiumCSV) {
      const filasCsv = csvText.split(/\r?\n/).filter((l, i) => i > 0 && l.trim()).length;
      const [resGcsv, resIcsv] = await Promise.all([
        dbClient.from('gastos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado'),
        dbClient.from('ingresos').select('*', { count: 'exact', head: true }).eq('usuario_id', uid).eq('origen', 'importado')
      ]);
      const totalImportados = (resGcsv.count ?? 0) + (resIcsv.count ?? 0);
      console.log('filasCsv:', filasCsv, 'totalImportados:', totalImportados, 'limiteTotal:', limiteTotalCSV);
      if (totalImportados + filasCsv > limiteTotalCSV) {
        _pendingCsvText = csvText;
        document.getElementById('csv-btn-seleccionar').style.display = 'block';
        document.getElementById('csv-estado').textContent = '';
        cerrarCSV();
        document.getElementById('modal-limite-premium').style.display = 'flex';
        actualizarModalLimite();
        return;
      }
    }

    const { data: { session } } = await dbClient.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      document.getElementById('csv-estado').textContent = 'Sesión expirada, vuelve a iniciar sesión.';
      document.getElementById('csv-btn-seleccionar').style.display = 'block';
      return;
    }
    await cargarCategoriasPerfil();
    const categorias = categoriasPerfil;
    const resp = await fetch('/.netlify/functions/import-csv', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ csv: csvText, categorias })
    });
    let datos;
    if (!resp.ok) {
      datos = await resp.json().catch(() => ({}));
      const dbgTxt = datos.dbg ? '\n\n─── DEBUG ───\n' + JSON.stringify(datos.dbg, null, 2) : '';
      document.getElementById('csv-estado').textContent = '❌ ' + (datos.error || 'Error del servidor') + dbgTxt;
      document.getElementById('csv-btn-seleccionar').style.display = 'block';
      return;
    }
    datos = await resp.json();
    console.log('DBG importacion:', JSON.stringify(datos.dbg, null, 2));
    // Aceptar movimientos de Tipo A (mifinanza) y Tipo B (banco), más alias gastos
    let movimientos = Array.isArray(datos.movimientos) && datos.movimientos.length
      ? datos.movimientos
      : Array.isArray(datos.gastos)
        ? datos.gastos.map(g => ({ ...g, tipo: g.tipo || 'gasto' }))
        : [];

    if (!movimientos.length) {
      const dbgTxt = datos.dbg ? '\n\n─── DEBUG ───\n' + JSON.stringify(datos.dbg, null, 2) : '';
      document.getElementById('csv-estado').textContent = '❌ No se encontraron movimientos en el archivo' + dbgTxt;
      document.getElementById('csv-btn-seleccionar').style.display = 'block';
      return;
    }
    cerrarCSV();
    abrirRevisionVoz(movimientos);
  } catch (err) {
    document.getElementById('csv-estado').textContent = '❌ ' + err.message + '\n\nRevisa que el archivo sea un CSV, XLS o XLSX válido.';
    document.getElementById('csv-btn-seleccionar').style.display = 'block';
  }
}

cargarMovimientos();
