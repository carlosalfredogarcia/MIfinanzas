// Supabase simulado para las pruebas: lee de window.__DATA__ y anota lo que se escribe
// en window.__INS__ (insert), window.__UPD__ (update) y window.__DEL__ (delete).
(function () {
  const D = window.__DATA__ || {};
  function q(table) {
    let rows = (D[table] || []).slice(), one = false;
    const api = {
      insert(v) { (window.__INS__ = window.__INS__ || []).push({ table, v }); rows = [{ id: 'nuevo-1' }]; return p; },
      update(v) { (window.__UPD__ = window.__UPD__ || []).push({ table, v }); return p; },
      delete() { (window.__DEL__ = window.__DEL__ || []).push(table); return p; },
      // Filtros como en Supabase; si la fila no tiene esa columna en los datos de prueba, no se filtra
      eq(c, v) { rows = rows.filter(r => r[c] === undefined || String(r[c]) === String(v)); return p; },
      in(c, vs) { rows = rows.filter(r => r[c] === undefined || vs.map(String).includes(String(r[c]))); return p; },
      or(expr) {
        const conds = expr.split(',').map(x => x.split('.'))
        rows = rows.filter(r => conds.some(([c, op, ...v]) => { const val = v.join('.'); return op === 'is' ? r[c] == null : op === 'gte' ? r[c] != null && r[c] >= val : op === 'lte' ? r[c] != null && r[c] <= val : op === 'eq' ? String(r[c]) === val : true }))
        return p
      },
      gte(c, v) { rows = rows.filter(r => r[c] >= v); return p; },
      lte(c, v) { rows = rows.filter(r => r[c] <= v); return p; },
      order(c, o) { rows.sort((a, z) => (o && o.ascending ? 1 : -1) * (a[c] > z[c] ? 1 : -1)); return p; },
      limit(n) { rows = rows.slice(0, n); return p; },
      single() { one = true; return p; }, maybeSingle() { one = true; return p; },
      then(res, rej) { return Promise.resolve({ data: one ? (rows[0] || null) : rows, error: null, count: rows.length }).then(res, rej); },
    };
    const p = new Proxy(api, { get: (t, k) => k in t ? t[k] : () => p });
    return p;
  }
  const usuario = { id: 'u1', email: 'prueba@correo.com' };
  const auth = {
    getSession: () => Promise.resolve({ data: { session: window.__SIN_SESION__ ? null : { access_token: 't', user: usuario } } }),
    getUser: () => Promise.resolve({ data: { user: usuario } }),
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    signOut: () => Promise.resolve({}),
    resetPasswordForEmail: (e, o) => { window.__RESET__ = [e, o]; return Promise.resolve({ error: null }); },
  };
  // Archivos (comprobantes): los guardados vienen en __DATA__.__archivos; las subidas se anotan en __SUBIDOS__.
  // Con window.__SIN_BUCKET__ simula que aún no se ejecutó el SQL que crea el espacio.
  const sinBucket = () => window.__SIN_BUCKET__ ? { data: null, error: { message: 'Bucket not found' } } : null
  const storage = { from: () => ({
    list: async () => sinBucket() || { data: (D.__archivos || []).map(name => ({ name })), error: null },
    upload: async (path, blob) => { (window.__SUBIDOS__ = window.__SUBIDOS__ || []).push({ path, tipo: blob.type, bytes: blob.size }); return sinBucket() || { data: { path }, error: null } },
    remove: async paths => { (window.__QUITADOS__ = window.__QUITADOS__ || []).push(...paths); return { data: null, error: null } },
    createSignedUrl: async () => {
      const c = document.createElement('canvas'); c.width = 60; c.height = 90
      const g = c.getContext('2d'); g.fillStyle = '#10b981'; g.fillRect(0, 0, 60, 90)
      return { data: { signedUrl: c.toDataURL('image/jpeg') }, error: null }
    },
  }) };
  window.supabase = { createClient: () => new Proxy({ from: q, auth, storage, rpc: () => Promise.resolve({ data: null, error: null }) }, { get: (t, k) => k in t ? t[k] : () => ({}) }) };
})();
