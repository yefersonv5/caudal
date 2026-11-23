/* ---------- nube: Supabase (cuenta, sincronización, IA y atajos) ---------- */
/* conexión al proyecto de Supabase de esta instalación: URL y publishable key (la publishable sí puede ir en el código) */
const CLOUD = { url:'https://mxozutrbhjucrlzgqzzz.supabase.co', key:'sb_publishable_KXYWPcaltKjvSNW1pkjVxw_0IYnldDy' };
const PEND = 'caudal.pending';
let cerrandoSesion = false;
let sb = null, session = null, lastSnap = null, syncT = null, syncing = false, syncState = 'local', syncedAt = 0, CTOKEN = null;
try { if (window.supabase && window.supabase.createClient) sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth:{ persistSession:true, autoRefreshToken:true, storageKey:'caudal.auth' } }); } catch (_) { sb = null; }
function cloudAI(){ return !!(sb && session); }

/* filas ↔ estado */
function snapshot(st){
  const m = {}, put = (t, k, row) => { (m[t] = m[t] || new Map()).set(k, JSON.stringify(row)); };
  ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'].forEach(t => m[t] = new Map());
  put('settings', 'me', { name:st.settings.name || null, start_day:st.settings.startDay || 1, period_mode:st.settings.periodMode || null, pay_last:st.settings.payLast || null, rate:st.settings.rate || 0, last_account:st.lastAccount || null, card_map:st.cardMap || {}, perfil:st.settings.perfil || null, ia_saldo:st.settings.iaSaldo || null, metas:(st.settings.metas || []).length ? st.settings.metas : null, ...(st.settings.exc ? { exc:st.settings.exc } : {}), ...(st.settings.cierres ? { cierres:st.settings.cierres } : {}), pin:st.settings.pin || null, avisos:st.settings.avisos || null });
  for (const a of st.accounts) put('accounts', a.id, { id:a.id, name:a.name, grp:a.group || 'Otros', sort:Math.round(a.order || 0), hidden:!!a.hidden, card:a.card || null, apart:!!a.apart, debt:a.debt || null, parent_id:a.parentAcc || null });
  for (const c of st.categories) put('categories', c.id, { id:c.id, name:c.name, emoji:c.emoji || null, type:c.type, parent_id:c.parentId || null, sort:Math.round(c.order || 0), hidden:!!c.hidden });
  for (const t of st.transactions) put('transactions', t.id, { id:t.id, type:t.type, amount:Math.round(t.amount), date:t.date, ts:t.ts ? Math.round(t.ts) : null, account_id:t.accountId || null, to_account_id:t.toAccountId || null, category_id:t.categoryId || null, note:t.note || null, persona:t.persona || null, de:t.de || null, lig:t.lig || null, src:t.src || null, auto:t.auto || null, pending:!!t.pending, fund:t.fund || null, grp:t.grp || null });
  for (const [k, v] of Object.entries(st.budgets || {})) put('budgets', k, { category_id:k, amount:Math.round(v) });
  for (const b of st.bills || []) put('bills', b.id, { id:b.id, name:b.name, category_id:b.categoryId || null, account_id:b.accountId || null, due_day:Math.round(b.dueDay) || 1, lead:Math.round(b.lead || 0), estimate:Math.round(b.estimate || 0), active:b.active !== false, cycles:b.cycles || {}, every:Math.round(b.every || 1), anchor:b.anchor || null, url:b.url || null, ref:b.ref || null });
  for (const r of st.recurring || []) put('recurring', r.id, { id:r.id, name:r.name, amount:Math.round(r.amount || 0), type:r.type || 'gasto', day:Math.round(r.day) || 1, category_id:r.categoryId || null, account_id:r.accountId || null, active:r.active !== false, next:r.next });
  for (const pl of st.plans || []) put('plans', pl.id, { id:pl.id, name:pl.name || null, income:Math.round(pl.income || 0), start:pl.start, from_account:pl.from || null, surplus_account:pl.surplus || null, items:(pl.items || []).map(i => ({ id:i.id, name:i.name, amount:Math.round(i.amount || 0), cls:i.cls, cats:i.cats || [], acc:i.acc || null, ...(i.every > 1 ? { every:i.every } : {}), ...(typeof i.fijo === 'boolean' ? { fijo:i.fijo } : {}) })) });
  const seen = new Set(); for (const x of st.inbox || []) { const rid = x.rowId || x.id; if (seen.has(rid)) continue; seen.add(rid); put('inbox', rid, { id:rid, raw:x.raw || null, item:x.src || x.item }); }
  return m;
}
function fromRows(R){
  const st = { version:1, source:'cloud', settings:{ startDay:1 }, accounts:[], categories:[], transactions:[], budgets:{}, bills:[], recurring:[], inbox:[], cardMap:{}, plans:[] };
  const s = R.settings[0];
  if (s) { st.settings = { startDay:s.start_day || 1, ...(s.period_mode ? { periodMode:s.period_mode } : {}), ...(s.pay_last ? { payLast:s.pay_last } : {}), name:s.name || undefined, rate:+s.rate || 0, ...(s.perfil ? { perfil:s.perfil } : {}), ...(s.ia_saldo ? { iaSaldo:s.ia_saldo } : {}), ...(Array.isArray(s.metas) ? { metas:s.metas } : {}), ...(s.backup_at ? { backupAt:s.backup_at } : {}), ...(s.exc ? { exc:s.exc } : {}), ...(s.cierres ? { cierres:s.cierres } : {}), ...(s.pin ? { pin:s.pin } : {}), ...(s.avisos ? { avisos:s.avisos } : {}) }; st.lastAccount = s.last_account || undefined; st.cardMap = s.card_map || {}; }
  st.accounts = R.accounts.map(r => ({ id:r.id, name:r.name, group:r.grp, order:r.sort, hidden:r.hidden, ...(r.card ? { card:r.card } : {}), ...(r.apart ? { apart:true } : {}), ...(r.debt ? { debt:r.debt } : {}), ...(r.parent_id ? { parentAcc:r.parent_id } : {}) })).sort((a, b) => a.order - b.order);
  st.categories = R.categories.map(r => ({ id:r.id, name:r.name, emoji:r.emoji || '', type:r.type, parentId:r.parent_id || null, order:r.sort, hidden:r.hidden })).sort((a, b) => a.order - b.order);
  st.transactions = R.transactions.map(r => { const t = { id:r.id, type:r.type, amount:+r.amount, date:r.date, ts:+r.ts || 0, accountId:r.account_id, note:r.note || '' };
    if (r.to_account_id) t.toAccountId = r.to_account_id; if (r.category_id) t.categoryId = r.category_id; if (r.src) t.src = r.src; if (r.auto) t.auto = r.auto; if (r.pending) t.pending = true; if (r.fund) t.fund = r.fund; if (r.grp) t.grp = r.grp; if (r.persona) t.persona = r.persona; if (r.de) t.de = r.de; if (r.lig) t.lig = r.lig; return t; });
  for (const b of R.budgets) st.budgets[b.category_id] = +b.amount;
  st.bills = R.bills.map(r => ({ id:r.id, name:r.name, categoryId:r.category_id, accountId:r.account_id, dueDay:r.due_day, lead:r.lead, estimate:+r.estimate, active:r.active, cycles:r.cycles || {}, every:+r.every || 1, anchor:r.anchor || null, url:r.url || '', ref:r.ref || '' }));
  st.recurring = R.recurring.map(r => ({ id:r.id, name:r.name, amount:+r.amount, type:r.type, day:r.day, categoryId:r.category_id, accountId:r.account_id, active:r.active, next:r.next }));
  st.plans = (R.plans || []).map(r => ({ id:r.id, name:r.name || 'Plan', income:+r.income || 0, start:r.start, from:r.from_account || null, surplus:r.surplus_account || null, items:Array.isArray(r.items) ? r.items : [] }));
  sortTx(st);
  const prev = S; S = st;
  for (const r of R.inbox) { const src = r.item || {}; if (!src.date && r.created_at) src.date = iso(new Date(r.created_at)); inboxAdd(r.id, r.raw, src, Date.parse(r.created_at) || Date.now()); }
  S = prev; return st;
}
async function fetchAll(table){
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').range(from, from + 999);
    if (error) throw error; out.push(...data); if (data.length < 1000) break;
  }
  return out;
}
/* Sin internet la app trabaja sobre lo guardado en el celular. Al volver la conexión se MEZCLA con la nube, nunca se reemplaza a ciegas.
   'caudal.base' guarda, por tabla, cada fila de la última sincronización buena con una huella de su contenido. Con eso se sabe, fila por fila:
   - está en los dos lados: gana el lado que manda (el celular si tiene cambios pendientes, si no la nube);
   - está en un solo lado y no estaba en la base: es nueva, se conserva;
   - está en un solo lado y sí estaba en la base: el otro lado la borró. Se borra solo si no cambió desde la base;
     si cambió, se conserva (es preferible que reaparezca algo a perder un movimiento).
   Sin base se suma todo. */
const TABLAS = ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'], BASE = 'caudal.base';
let pulling = false, offlineHubo = false;
const leerPend = () => { try { return localStorage.getItem(PEND) === '1'; } catch (_) { return false; } };
/* huella corta del contenido de una fila (para no guardar filas completas en la base) */
const huella = v => { let h = 5381; for (let i = 0; i < v.length; i++) h = (h * 33 ^ v.charCodeAt(i)) >>> 0; return h.toString(36); };
function baseLeer(uid){ try { const b = JSON.parse(localStorage.getItem(BASE) || 'null'); return b && b.u === uid ? b.t : null; } catch (_) { return null; } }
function baseGuardar(snap){ if (!session) return; const t = {}; for (const k of Object.keys(snap)) { t[k] = {}; for (const [id, v] of snap[k]) t[k][id] = huella(v); }
  try { localStorage.setItem(BASE, JSON.stringify({ u:session.user.id, t })); } catch (_) {} }
const llaveFila = (t, x) => t === 'inbox' ? (x.rowId || x.id) : x.id;
function copiarFilas(dst, src, t, keys){
  const ks = new Set(keys);
  if (t === 'budgets') { dst.budgets = dst.budgets || {}; for (const k of ks) if (src.budgets && k in src.budgets) dst.budgets[k] = src.budgets[k]; return; }
  dst[t] = dst[t] || []; for (const x of src[t] || []) if (ks.has(llaveFila(t, x))) dst[t].push(JSON.parse(JSON.stringify(x)));
}
function quitarFilas(dst, t, keys){
  const ks = new Set(keys);
  if (t === 'budgets') { for (const k of ks) if (dst.budgets) delete dst.budgets[k]; return; }
  dst[t] = (dst[t] || []).filter(x => !ks.has(llaveFila(t, x)));
}
/* pendiente: manda el celular. Sin pendiente: manda la nube. n = movimientos que solo estaban en el celular y se rescataron */
function mezclar(local, remote, base, pending){
  const lsnap = snapshot(local), rsnap = snapshot(remote);
  const dst = pending ? local : remote, src = pending ? remote : local, dsnap = pending ? lsnap : rsnap, ssnap = pending ? rsnap : lsnap;
  let n = 0;
  for (const t of TABLAS) { if (t === 'settings') continue;
    const b = base && base[t] && !Array.isArray(base[t]) ? base[t] : null;
    const borradoSinCambios = (k, snap) => b && k in b && b[k] === huella(snap[t].get(k));
    /* filas que solo tiene el lado que no manda: nuevas (se traen) o borradas por el que manda (se respetan si no cambiaron) */
    const traer = [...ssnap[t].keys()].filter(k => !dsnap[t].has(k) && !borradoSinCambios(k, ssnap));
    /* filas que solo tiene el lado que manda y que el otro borró sin que aquí cambiaran: se quitan */
    const quitar = [...dsnap[t].keys()].filter(k => !ssnap[t].has(k) && borradoSinCambios(k, dsnap));
    if (traer.length) { copiarFilas(dst, src, t, traer); if (t === 'transactions' && !pending) n += traer.length; }
    if (quitar.length) quitarFilas(dst, t, quitar); }
  dst.accounts.sort((a, b) => (a.order || 0) - (b.order || 0)); dst.categories.sort((a, b) => (a.order || 0) - (b.order || 0)); sortTx(dst);
  return { st:dst, n };
}
function snapIgual(a, b){ for (const t of TABLAS) { const x = a[t], y = b[t]; if (x.size !== y.size) return false; for (const [k, v] of x) if (y.get(k) !== v) return false; } return true; }
async function pull(){
  if (!sb || !session) return;
  if (pulling) return; pulling = true;
  try {
    const R = {}, res = await Promise.all(TABLAS.map(fetchAll)); TABLAS.forEach((t, i) => R[t] = res[i]);
    const empty = !R.settings.length && !R.accounts.length && !R.transactions.length;
    const remote = empty ? null : fromRows(R), rsnap = remote ? snapshot(remote) : emptySnap();
    const pending = leerPend();
    let rescatados = 0;
    /* llegan tus datos y reemplazan los de ejemplo: se guardan de una vez en el celular para que la próxima apertura no espere a la nube */
    if (remote && S.demo) { S = remote; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
    else if (remote) {
      const antes = JSON.stringify(S), m = mezclar(S, remote, baseLeer(session.user.id), pending);
      rescatados = m.n;
      if (JSON.stringify(m.st) !== antes) copiaPrevia(); /* lo de antes queda en Ajustes › Datos › Copias en este celular */
      S = m.st; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
    }
    lastSnap = rsnap;
    delete S.cargando; /* cuenta nueva sin nada en la nube: ya se pueden mostrar los de ejemplo */
    completarEstado(S);
    runRecurring();
    if (S.demo && !remote) setSync('vacio');
    else if (!remote || !snapIgual(snapshot(S), rsnap)) { try { localStorage.setItem(PEND, '1'); } catch (_) {} if (rescatados) offlineHubo = true; await pushNow(true); }
    else { try { localStorage.removeItem(PEND); } catch (_) {} baseGuardar(rsnap); syncedAt = Date.now(); setSync('ok'); }
    if (billsAutoMatch()) save();
    render();
    setTimeout(autoInbox, 350);
  } finally { pulling = false; }
}
function emptySnap(){ const m = {}; ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'].forEach(t => m[t] = new Map()); return m; }
const PK = { settings:null, budgets:'category_id' };
async function pushNow(desdePull){
  if (!sb || S.demo) return;
  if (!session) { reintentarSesion(); return; }
  if (navigator.onLine === false) { setSync('offline'); return; }
  /* si la primera descarga falló (abrió sin internet), primero se trae y se mezcla; pull sube lo que falte */
  if (!lastSnap) { if (!desdePull) { try { await pull(); } catch (e) { setSync(navigator.onLine === false ? 'offline' : 'error', e && e.message); scheduleSync(30000); } } return; }
  if (syncing) { scheduleSync(1500); return; }
  syncing = true; setSync('subiendo');
  try { const { data } = await sb.auth.getSession(); if (data && data.session) session = data.session; } catch (_) {}
  const snap = snapshot(S), uidv = session.user.id;
  try {
    /* cada tabla se sube por separado: si una falla, las demás igual quedan en la nube (antes una cuenta mala frenaba los movimientos).
       Si un bloque falla, se reintenta fila por fila para que solo quede pendiente la fila con problema. */
    const hecho = { ...lastSnap }, fallas = [];
    for (const t of Object.keys(snap)) {
      const cur = snap[t], old = lastSnap[t] || new Map(), up = [], del = [];
      for (const [k, v] of cur) if (old.get(k) !== v) up.push({ ...JSON.parse(v), user_id:uidv });
      for (const k of old.keys()) if (!cur.has(k)) del.push(k);
      const conflict = t === 'settings' ? 'user_id' : t === 'budgets' ? 'user_id,category_id' : 'user_id,id';
      let ok = true;
      for (let i = 0; i < up.length; i += 500) {
        const lote = up.slice(i, i + 500), { error } = await sb.from(t).upsert(lote, { onConflict:conflict });
        if (!error) continue;
        if (navigator.onLine === false || lote.length === 1) { ok = false; fallas.push(error); continue; }
        for (const fila of lote) { const r = await sb.from(t).upsert([fila], { onConflict:conflict }); if (r.error) { ok = false; fallas.push(r.error); } }
      }
      const col = PK[t] || 'id';
      for (let i = 0; i < del.length; i += 200) { if (t === 'settings') break; const { error } = await sb.from(t).delete().eq('user_id', uidv).in(col, del.slice(i, i + 200)); if (error) { ok = false; fallas.push(error); } }
      if (ok) hecho[t] = cur;
    }
    lastSnap = hecho; pushedAt = Date.now(); baseGuardar(hecho);
    if (fallas.length) throw fallas[0];
    if (snapIgual(snapshot(S), snap)) { try { localStorage.removeItem(PEND); } catch (_) {} } else scheduleSync(300); /* se registró algo mientras subía */
    syncedAt = Date.now(); setSync('ok');
    if (offlineHubo) { offlineHubo = false; toast('Listo: lo que anotaste sin internet ya quedó en tu nube', 3500); }
  } catch (e) { setSync(navigator.onLine === false ? 'offline' : 'error', e && e.message); scheduleSync(30000); }
  finally { syncing = false; }
}
/* tiempo real: cuando otro dispositivo cambia algo, Supabase avisa y se traen los datos.
   Se ignoran los ecos de lo que este mismo dispositivo acaba de subir, y se espera si hay un formulario abierto. */
const RT_TABLES = ['transactions','accounts','categories','budgets','bills','recurring','plans','settings','inbox'];
let RT = null, rtT = null, pushedAt = 0;
function rtStart(){
  if (RT || !sb || !session) return;
  const uidv = session.user.id; RT = sb.channel('caudal-' + uidv);
  for (const t of RT_TABLES) RT.on('postgres_changes', { event:'*', schema:'public', table:t, filter:'user_id=eq.' + uidv }, rtHit);
  RT.subscribe(st => { if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') { try { sb.removeChannel(RT); } catch (_) {} RT = null; setTimeout(rtStart, 15000); } });
}
function rtStop(){ if (RT) { try { sb.removeChannel(RT); } catch (_) {} RT = null; } }
function rtHit(){ if (syncing || Date.now() - pushedAt < 4000) return; clearTimeout(rtT); rtT = setTimeout(rtPull, 1200); }
async function rtPull(){
  if (syncing || leerPend() || (SM || F || BF || RF || PF || IF)) { clearTimeout(rtT); rtT = setTimeout(rtPull, 3000); return; }
  const y = window.scrollY; try { await pull(); window.scrollTo(0, y); } catch (_) {}
}
function scheduleSync(ms){ clearTimeout(syncT); syncT = setTimeout(pushNow, ms || 900); }
/* todo lo que se guarda queda marcado como pendiente, haya o no sesión: así nunca se pisa al sincronizar */
function afterSave(){
  if (!sb || S.demo) return;
  try { localStorage.setItem(PEND, '1'); } catch (_) {}
  if (!session || navigator.onLine === false) { offlineHubo = true; setSync(session || cuentaGuardada() ? 'offline' : 'local'); if (!session) reintentarSesion(); return; }
  setSync('pendiente'); scheduleSync();
}
/* hay una cuenta guardada en el celular aunque la sesión no se haya podido renovar (sin internet) */
function cuentaGuardada(){ try { return !!localStorage.getItem('caudal.auth'); } catch (_) { return false; } }
let reintT = null;
function reintentarSesion(){
  if (!sb || session || !cuentaGuardada()) return;
  clearTimeout(reintT);
  sb.auth.getSession().then(({ data }) => { if (data && data.session) entrar(data.session); else if (!cuentaGuardada()) authScreen('Tu sesión venció. Entra de nuevo: lo que anotaste está guardado en este celular y se sube al entrar.'); else reintT = setTimeout(reintentarSesion, 30000); })
    .catch(() => { reintT = setTimeout(reintentarSesion, 30000); });
}
function entrar(s){
  const had = !!session; session = s;
  try { localStorage.setItem('caudal.cuenta', s.user.email || '1'); } catch (_) {}
  const a = document.getElementById('auth'); if (a) a.remove();
  if (!had) pull().then(() => { rtStart(); iaNotesLoad(); }).catch(e => { setSync(navigator.onLine === false ? 'offline' : 'error', e && e.message); scheduleSync(30000); render(); });
}
let syncMsg = '';
function setSync(st, msg){
  syncState = st; syncMsg = msg || '';
  cloudIcon();
  const el = document.getElementById('syncline'); if (el) el.textContent = syncText();
  const ss = document.getElementById('sidesync'); if (ss) { ss.textContent = ss.title = syncText(); ss.dataset.st = st; }
}
/* ícono de nube del celular según el estado de la sincronización */
const CLOUD_P = 'M7 18.5h10.2a4.3 4.3 0 0 0 .6-8.55A6.2 6.2 0 0 0 6 9.4a4.6 4.6 0 0 0 1 9.1z';
const CLOUD_X = { ok:'<path d="M9.4 14l2 2 3.8-3.9"/>', subiendo:'<path d="M12 16.5v-5M9.7 13.6l2.3-2.3 2.3 2.3"/>', pendiente:'<path d="M12 16.5v-5M9.7 13.6l2.3-2.3 2.3 2.3"/>',
  offline:'<path d="M4 4l16 16"/>', error:'<path d="M12 11.2v2.8M12 16.4v.1"/>', vacio:'' };
function cloudIcon(){
  const b = document.getElementById('cloudst'); if (!b) return;
  const st = syncState || 'local'; if (b.dataset.st === st && b.innerHTML) { b.setAttribute('aria-label', syncText()); return; }
  b.dataset.st = st; b.setAttribute('aria-label', syncText()); b.title = syncText();
  b.innerHTML = st === 'local'
    ? '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + CLOUD_P + '"/>' + (CLOUD_X[st] || '') + '</svg>';
}
document.addEventListener('click', e => {
  if (!e.target.closest('#cloudst')) return;
  if (syncState === 'error' || syncState === 'offline' || syncState === 'pendiente') { reintentarSesion(); scheduleSync(200); }
  if (syncState === 'local' || syncState === 'vacio') { go('ajustes', 'cuenta'); return toast(syncText(), 3000); }
  toast(syncText(), 2600);
});
function syncText(){
  return { ok:'Sincronizado' + (syncedAt ? ' · ' + new Date(syncedAt).toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' }) : ''), subiendo:'Guardando en tu nube…', pendiente:'Cambios por guardar…', offline:'Sin internet: todo queda guardado en el celular y se sube solo al volver', error:'No se pudo guardar. Reintentando…', vacio:'Tu nube está vacía: importa tu respaldo', local:'Solo en este dispositivo' }[syncState] || '';
}
window.addEventListener('online', () => { if (session) scheduleSync(500); else reintentarSesion(); });
window.addEventListener('offline', () => { if (session || cuentaGuardada()) setSync('offline'); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !sb) return;
  if (!session) { reintentarSesion(); return; }
  if (syncing) return;
  if (leerPend()) scheduleSync(300); else if (!(SM || F || BF || RF || PF || IF)) { try { await pull(); } catch (_) {} }
  rtStart();
});

/* IA en el servidor (Gemini) */
async function blobToB64(b){ const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { mime:b.type || 'image/jpeg', data:btoa(s) }; }
async function iaCall(prompt, json, images, task, extra){
  const imgs = images && images.length ? await Promise.all(images.map(blobToB64)) : [];
  const body = { prompt, json:!!json, images:imgs, task:task || 'registro', ...(extra || {}) };
  let { data, error } = await sb.functions.invoke('ia', { body });
  /* la petición no salió del celular (iPhone suele fallar el primer envío al volver de otra app): se reintenta una vez */
  if (error && error.name === 'FunctionsFetchError') { await new Promise(r => setTimeout(r, 900)); ({ data, error } = await sb.functions.invoke('ia', { body })); }
  if (error && error.name === 'FunctionsFetchError') throw { code:'network' };
  if (error) { let b = null; try { b = await error.context.json(); } catch (_) {}
    throw { code:(b && b.code) || 'upstream_error', message:(b && b.error) || error.message, text:b && b.code !== 'rate_limited' && b.code !== 'not_granted' ? b.error : '' }; }
  if (data && data.error) throw { code:data.code || 'upstream_error', message:data.error, text:data.error };
  if (!json) { if (!String(data.text || '').trim()) throw { code:'upstream_error', text:'La IA no alcanzó a responder. Intenta de nuevo.' }; return data.text; }
  try { return JSON.parse(data.text); } catch (_) { const m = String(data.text || '').match(/\{[\s\S]*\}|\[[\s\S]*\]/); if (m) return JSON.parse(m[0]); throw { code:'invalid_json', text:data.text }; }
}

/* llave de atajos */
async function loadToken(){
  if (!sb || !session || CTOKEN) return;
  let { data } = await sb.from('shortcut_tokens').select('token').maybeSingle();
  if (!data) { const r = await sb.from('shortcut_tokens').insert({ user_id:session.user.id }).select('token').single(); data = r.data; }
  CTOKEN = data && data.token; if (ui.view === 'ajustes') render();
}

/* pantalla de acceso */
function authScreen(msg){
  let el = document.getElementById('auth');
  if (!el) { el = document.createElement('div'); el.id = 'auth'; document.body.appendChild(el); }
  el.innerHTML = '<div class="auth-in"><div class="brand" style="justify-content:center">' + $('.top .mark').outerHTML + 'Caudal</div>' +
    '<h1 style="margin:22px 0 4px;font-weight:500;font-size:26px;text-align:center">Entra a tu cuenta</h1><p class="insight" style="text-align:center;margin-bottom:18px">Tus datos viven en tu propia base y solo tú puedes verlos.</p>' +
    '<form class="form" id="authf" novalidate><input class="inp" id="au-mail" type="email" autocomplete="username" placeholder="Correo" aria-label="Correo">' +
    '<input class="inp" id="au-pass" type="password" autocomplete="current-password" placeholder="Contraseña" aria-label="Contraseña"><div class="err" id="au-err" style="margin:0">' + esc(msg || '') + '</div>' +
    '<button class="btn block" type="submit" id="au-in">Entrar</button>' +
    (navigator.onLine === false ? '<p class="insight" style="text-align:center;margin:4px 0 0">No hay internet. Puedes seguir usando Caudal: lo que anotes queda en este celular y se sube cuando entres.</p>' : '') +
    '<button class="tool" type="button" id="au-skip" style="align-self:center;border:0">' + (navigator.onLine === false ? 'Seguir sin internet' : 'Usar sin cuenta en este dispositivo') + '</button></form></div>';
}
async function authDo(kind){
  const mail = $('#au-mail').value.trim(), pass = $('#au-pass').value, err = $('#au-err');
  if (!mail || pass.length < 8) { err.textContent = 'Escribe tu correo y una contraseña de al menos 8 caracteres.'; return; }
  err.textContent = kind === 'up' ? 'Creando tu cuenta…' : 'Entrando…';
  const r = kind === 'up' ? await sb.auth.signUp({ email:mail, password:pass }) : await sb.auth.signInWithPassword({ email:mail, password:pass });
  if (r.error) { err.textContent = /invalid/i.test(r.error.message) ? 'Correo o contraseña incorrectos.' : /signups? not allowed|disabled/i.test(r.error.message) ? 'La creación de cuentas está cerrada. Entra con tu cuenta.' : r.error.message; return; }
  if (!r.data.session) { err.textContent = 'Revisa tu correo para confirmar la cuenta y luego entra.'; return; }
}
document.addEventListener('submit', e => { if (e.target.id === 'authf') { e.preventDefault(); authDo('in'); } }, true);
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.id === 'au-up') return authDo('up');
  if (el.id === 'au-skip') { const a = document.getElementById('auth'); if (a) a.remove(); setSync('local'); if (S.cargando) { delete S.cargando; render(); } return; }
  if (el.id === 'cl-sync') return pushNow();
  if (el.id === 'cl-out') {
    if (leerPend() && el.dataset.arm !== '1') { el.dataset.arm = '1'; el.textContent = '¿Cerrar igual?'; return toast('Hay cambios sin subir. Si cierras sesión quedan en este celular y se suben al volver a entrar.', 4000); }
    cerrandoSesion = true; sb.auth.signOut(); return; }
  if (el.id === 'cl-in') return authScreen();
  if (el.dataset.copy) { const v = el.dataset.copy; navigator.clipboard.writeText(v).then(() => toast('Copiado'), () => toast('No se pudo copiar')); }
});

function cloudCard(){
  if (!sb) return '';
  if (!session) return '<section class="card glow"><div class="card-h"><h2>Tu nube</h2></div><p class="insight">Estás usando Caudal solo en este dispositivo. Entra para guardar todo en tu base y usar la IA y los atajos.</p><button class="btn" id="cl-in">Entrar</button></section>';
  return '<section class="card glow"><div class="card-h"><h2>Tu nube</h2><span class="aside">' + esc(session.user.email || '') + '</span></div><p class="insight" id="syncline">' + syncText() + '</p>' +
    '<div class="two"><button class="btn ghost" id="cl-sync">Sincronizar</button><button class="btn ghost" id="cl-out">Cerrar sesión</button></div></section>';
}
function shortcutsCard(){
  if (!sb || !session) return '<section class="card"><div class="card-h"><h2>Registro automático</h2>' + SPARK + '</div><p class="insight">Entra a tu cuenta para activar los atajos del iPhone.</p></section>';
  loadToken();
  const ep = CLOUD.url + '/functions/v1/atajo';
  const step = (t, d) => '<details class="howto"><summary>' + t + '</summary><div>' + d + '</div></details>';
  const body = k => '<code>{"token": "TU-LLAVE", ' + k + '}</code>';
  return '<section class="card"><div class="card-h"><h2>Registro automático</h2>' + SPARK + '</div>' +
    '<p class="insight">Tus atajos mandan cada movimiento a <b>Por revisar</b> sin abrir la app. En todos usas la acción <b>Obtener contenido de URL</b> con método <b>POST</b> y cuerpo <b>JSON</b>.</p>' +
    '<div class="set" style="border-top:0"><div class="t"><b>Dirección</b><span style="word-break:break-all">' + esc(ep) + '</span></div><button class="btn sm ghost" data-copy="' + esc(ep) + '">Copiar</button></div>' +
    (CTOKEN ? '<div class="set"><div class="t"><b>Dirección con tu llave</b><span>La más fácil: pégala tal cual en el atajo y solo agregas un campo.</span></div><button class="btn sm" data-copy="' + esc(ep + '?k=' + CTOKEN) + '">Copiar</button></div>' +
      '<div class="set"><div class="t"><b>Dirección del respaldo</b><span>Para el atajo semanal que guarda tu copia en iCloud Drive.</span></div><button class="btn sm ghost" data-copy="' + esc(CLOUD.url + '/functions/v1/respaldo?k=' + CTOKEN) + '">Copiar</button></div>' : '') +
    '<div class="set"><div class="t"><b>Tu llave personal</b><span>' + (CTOKEN ? 'No la compartas: con ella se puede anotar en tu cuenta.' : 'Cargando…') + '</span></div>' + (CTOKEN ? '<button class="btn sm ghost" data-copy="' + esc(CTOKEN) + '">Copiar</button>' : '') + '</div>' +
    step('Al pagar con Apple Pay', 'Atajos → Automatización → Nueva → <b>Transacción</b> → tus tarjetas → <b>Ejecutar de inmediato</b>. Acción <b>Obtener contenido de URL</b> con estos campos:' + body('"monto": Importe, "comercio": Comercio, "tarjeta": Tarjeta')) +
    step('Con el SMS del banco', 'Automatización → <b>Mensaje</b> → "El mensaje contiene" Bancolombia, Lulo o Nequi → Ejecutar de inmediato. Acción <b>Obtener contenido de URL</b>:' + body('"n": Contenido del mensaje')) +
    step('Con el correo del banco', 'Automatización → <b>Correo</b> → remitente de tu banco. Igual que el SMS, con el cuerpo del correo en "n".') +
    step('“Oye Siri, anota un gasto”', 'Atajo llamado <b>Anota un gasto</b>: <b>Dictar texto</b> → <b>Obtener contenido de URL</b>:' + body('"t": Texto dictado') + 'Termina con <b>Mostrar notificación</b> "Anotado en Caudal". Ponlo también en el botón de acción o en la pantalla de inicio.') +
    '<p class="note" style="padding:0">Las notificaciones de las apps de los bancos no se pueden leer en iPhone; los SMS, correos y Apple Pay sí.</p>' +
    '<button class="btn ghost block" data-smart="banco">Probar el lector con una notificación</button></section>';
}

if (sb) {
  sb.auth.onAuthStateChange((ev, s) => {
    if (s) { if (!session) setTimeout(() => entrar(s)); else session = s; return; } /* setTimeout: no llamar a Supabase dentro de su propio aviso */
    if (ev !== 'SIGNED_OUT') return;
    const had = !!session; session = null; rtStop(); lastSnap = null; CTOKEN = null;
    if (had && cerrandoSesion) { cerrandoSesion = false; setSync('local'); authScreen('Cerraste sesión.'); }
    else if (!cuentaGuardada()) { setSync('local'); authScreen('Tu sesión venció. Entra de nuevo: lo que anotaste está guardado en este celular y se sube al entrar.'); }
  });
  if (cuentaGuardada()) setSync('offline'); /* mientras se renueva la sesión, se trabaja con lo del celular */
  sb.auth.getSession().then(({ data }) => {
    if (data.session) return;
    /* sin internet la sesión no se puede renovar, pero sigue guardada: se abre la app normal y se reintenta sola */
    if (cuentaGuardada()) { setSync('offline'); reintentarSesion(); }
    else authScreen();
  }).catch(() => { if (cuentaGuardada()) { setSync('offline'); reintentarSesion(); } else authScreen(); });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache:'none' }).then(r => r.update()).catch(() => {});
/* versión nueva publicada: se recarga sola al abrir o volver a la app */
async function checkVersion(){
  if (location.protocol !== 'https:' || (SM || F || BF || RF || PF || IF)) return;
  try { const v = (await (await fetch('version.json?t=' + Date.now(), { cache:'no-store' })).json()).v;
    if (v && v !== BUILD) { let last = 0; try { last = +sessionStorage.getItem('caudal.reloaded') || 0; } catch (_) {}
      if (Date.now() - last > 60000) { try { sessionStorage.setItem('caudal.reloaded', String(Date.now())); if (PIN.abierto) sessionStorage.setItem('caudal.pinpase', String(Date.now())); } catch (_) {} location.reload(); } } } catch (_) {}
}
setTimeout(checkVersion); /* al terminar de cargar el script: antes, los formularios (F, PF...) aún no existen */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVersion(); });

