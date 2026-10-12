/* ---------- nube: Supabase (cuenta, sincronización, IA y atajos) ---------- */
const CLOUD = { url:'https://mxozutrbhjucrlzgqzzz.supabase.co', key:'sb_publishable_KXYWPcaltKjvSNW1pkjVxw_0IYnldDy' };
const PEND = 'caudal.pending';
let sb = null, session = null, lastSnap = null, syncT = null, syncing = false, syncState = 'local', syncedAt = 0, CTOKEN = null;
try { if (window.supabase && window.supabase.createClient) sb = window.supabase.createClient(CLOUD.url, CLOUD.key, { auth:{ persistSession:true, autoRefreshToken:true, storageKey:'caudal.auth' } }); } catch (_) { sb = null; }
function cloudAI(){ return !!(sb && session); }

/* filas ↔ estado */
function snapshot(st){
  const m = {}, put = (t, k, row) => { (m[t] = m[t] || new Map()).set(k, JSON.stringify(row)); };
  ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'].forEach(t => m[t] = new Map());
  put('settings', 'me', { name:st.settings.name || null, start_day:st.settings.startDay || 1, rate:st.settings.rate || 0, last_account:st.lastAccount || null, card_map:st.cardMap || {} });
  for (const a of st.accounts) put('accounts', a.id, { id:a.id, name:a.name, grp:a.group || 'Otros', sort:a.order || 0, hidden:!!a.hidden });
  for (const c of st.categories) put('categories', c.id, { id:c.id, name:c.name, emoji:c.emoji || null, type:c.type, parent_id:c.parentId || null, sort:c.order || 0, hidden:!!c.hidden });
  for (const t of st.transactions) put('transactions', t.id, { id:t.id, type:t.type, amount:Math.round(t.amount), date:t.date, ts:t.ts || null, account_id:t.accountId || null, to_account_id:t.toAccountId || null, category_id:t.categoryId || null, note:t.note || null, src:t.src || null, auto:t.auto || null });
  for (const [k, v] of Object.entries(st.budgets || {})) put('budgets', k, { category_id:k, amount:Math.round(v) });
  for (const b of st.bills || []) put('bills', b.id, { id:b.id, name:b.name, category_id:b.categoryId || null, account_id:b.accountId || null, due_day:b.dueDay, lead:b.lead || 0, estimate:b.estimate || 0, active:b.active !== false, cycles:b.cycles || {} });
  for (const r of st.recurring || []) put('recurring', r.id, { id:r.id, name:r.name, amount:r.amount, type:r.type || 'gasto', day:r.day, category_id:r.categoryId || null, account_id:r.accountId || null, active:r.active !== false, next:r.next });
  for (const pl of st.plans || []) put('plans', pl.id, { id:pl.id, name:pl.name || null, income:Math.round(pl.income || 0), start:pl.start, from_account:pl.from || null, surplus_account:pl.surplus || null, items:(pl.items || []).map(i => ({ id:i.id, name:i.name, amount:Math.round(i.amount || 0), cls:i.cls, cats:i.cats || [], acc:i.acc || null })) });
  const seen = new Set(); for (const x of st.inbox || []) { const rid = x.rowId || x.id; if (seen.has(rid)) continue; seen.add(rid); put('inbox', rid, { id:rid, raw:x.raw || null, item:x.src || x.item }); }
  return m;
}
function fromRows(R){
  const st = { version:1, source:'cloud', settings:{ startDay:1 }, accounts:[], categories:[], transactions:[], budgets:{}, bills:[], recurring:[], inbox:[], cardMap:{}, plans:[] };
  const s = R.settings[0];
  if (s) { st.settings = { startDay:s.start_day || 1, name:s.name || undefined, rate:+s.rate || 0 }; st.lastAccount = s.last_account || undefined; st.cardMap = s.card_map || {}; }
  st.accounts = R.accounts.map(r => ({ id:r.id, name:r.name, group:r.grp, order:r.sort, hidden:r.hidden })).sort((a, b) => a.order - b.order);
  st.categories = R.categories.map(r => ({ id:r.id, name:r.name, emoji:r.emoji || '', type:r.type, parentId:r.parent_id || null, order:r.sort, hidden:r.hidden })).sort((a, b) => a.order - b.order);
  st.transactions = R.transactions.map(r => { const t = { id:r.id, type:r.type, amount:+r.amount, date:r.date, ts:+r.ts || 0, accountId:r.account_id, note:r.note || '' };
    if (r.to_account_id) t.toAccountId = r.to_account_id; if (r.category_id) t.categoryId = r.category_id; if (r.src) t.src = r.src; if (r.auto) t.auto = r.auto; return t; });
  for (const b of R.budgets) st.budgets[b.category_id] = +b.amount;
  st.bills = R.bills.map(r => ({ id:r.id, name:r.name, categoryId:r.category_id, accountId:r.account_id, dueDay:r.due_day, lead:r.lead, estimate:+r.estimate, active:r.active, cycles:r.cycles || {} }));
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
async function pull(){
  const T = ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'], R = {};
  const res = await Promise.all(T.map(fetchAll)); T.forEach((t, i) => R[t] = res[i]);
  const empty = !R.settings.length && !R.accounts.length && !R.transactions.length;
  const remote = empty ? null : fromRows(R);
  lastSnap = remote ? snapshot(remote) : emptySnap();
  let pending = false; try { pending = localStorage.getItem(PEND) === '1'; } catch (_) {}
  if (remote && !pending) { S = remote; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} }
  else if (remote && pending && S.demo) { S = remote; }
  else if (remote && pending && !(S.plans || []).length && remote.plans.length) { S.plans = remote.plans; }
  S.inbox = S.inbox || []; S.bills = S.bills || []; S.recurring = S.recurring || []; S.cardMap = S.cardMap || {};
  runRecurring();
  if (S.demo && !remote) setSync('vacio'); else { if (!remote || pending) await pushNow(); else setSync('ok'); }
  render();
}
function emptySnap(){ const m = {}; ['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','plans'].forEach(t => m[t] = new Map()); return m; }
const PK = { settings:null, budgets:'category_id' };
async function pushNow(){
  if (!sb || !session || !lastSnap || S.demo) return;
  if (syncing) { scheduleSync(1500); return; }
  syncing = true; setSync('subiendo');
  const snap = snapshot(S), uidv = session.user.id;
  try {
    for (const t of Object.keys(snap)) {
      const cur = snap[t], old = lastSnap[t] || new Map(), up = [], del = [];
      for (const [k, v] of cur) if (old.get(k) !== v) up.push({ ...JSON.parse(v), user_id:uidv });
      for (const k of old.keys()) if (!cur.has(k)) del.push(k);
      const conflict = t === 'settings' ? 'user_id' : t === 'budgets' ? 'user_id,category_id' : 'user_id,id';
      for (let i = 0; i < up.length; i += 500) { const { error } = await sb.from(t).upsert(up.slice(i, i + 500), { onConflict:conflict }); if (error) throw error; }
      const col = PK[t] || 'id';
      for (let i = 0; i < del.length; i += 200) { if (t === 'settings') break; const { error } = await sb.from(t).delete().eq('user_id', uidv).in(col, del.slice(i, i + 200)); if (error) throw error; }
    }
    lastSnap = snap; try { localStorage.removeItem(PEND); } catch (_) {}
    syncedAt = Date.now(); setSync('ok');
  } catch (e) { setSync(navigator.onLine === false ? 'offline' : 'error', e && e.message); scheduleSync(30000); }
  finally { syncing = false; }
}
function scheduleSync(ms){ clearTimeout(syncT); syncT = setTimeout(pushNow, ms || 900); }
function afterSave(){ if (!sb || !session || S.demo) return; try { localStorage.setItem(PEND, '1'); } catch (_) {} setSync('pendiente'); scheduleSync(); }
let syncMsg = '';
function setSync(st, msg){
  syncState = st; syncMsg = msg || '';
  const m = document.querySelector('.mark'); if (m) m.dataset.sync = st;
  const el = document.getElementById('syncline'); if (el) el.textContent = syncText();
}
function syncText(){
  return { ok:'Sincronizado' + (syncedAt ? ' · ' + new Date(syncedAt).toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' }) : ''), subiendo:'Guardando en tu nube…', pendiente:'Cambios por guardar…', offline:'Sin conexión: se guardará al volver', error:'No se pudo guardar. Reintentando…', vacio:'Tu nube está vacía: importa tu respaldo', local:'Solo en este dispositivo' }[syncState] || '';
}
window.addEventListener('online', () => scheduleSync(500));
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !sb || !session || syncing) return;
  let pending = false; try { pending = localStorage.getItem(PEND) === '1'; } catch (_) {}
  if (pending) scheduleSync(300); else if (!(SM || F || BF || RF || PF || IF)) { try { await pull(); } catch (_) {} }
});

/* IA en el servidor (Gemini) */
async function blobToB64(b){ const buf = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return { mime:b.type || 'image/jpeg', data:btoa(s) }; }
async function iaCall(prompt, json, images, task){
  const imgs = images && images.length ? await Promise.all(images.map(blobToB64)) : [];
  const { data, error } = await sb.functions.invoke('ia', { body:{ prompt, json:!!json, images:imgs, task:task || 'registro' } });
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
  el.innerHTML = '<div class="auth-in"><div class="brand" style="justify-content:center"><span class="mark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9c3-3 6 3 9 0s6 3 9 0M3 15c3-3 6 3 9 0s6 3 9 0"/></svg></span>Caudal</div>' +
    '<h1 style="margin:22px 0 4px;font-weight:500;font-size:26px;text-align:center">Entra a tu cuenta</h1><p class="insight" style="text-align:center;margin-bottom:18px">Tus datos viven en tu propia base y solo tú puedes verlos.</p>' +
    '<form class="form" id="authf" novalidate><input class="inp" id="au-mail" type="email" autocomplete="username" placeholder="Correo" aria-label="Correo">' +
    '<input class="inp" id="au-pass" type="password" autocomplete="current-password" placeholder="Contraseña" aria-label="Contraseña"><div class="err" id="au-err" style="margin:0">' + esc(msg || '') + '</div>' +
    '<button class="btn block" type="submit" id="au-in">Entrar</button><button class="btn ghost block" type="button" id="au-up">Crear mi cuenta</button>' +
    '<button class="tool" type="button" id="au-skip" style="align-self:center;border:0">Usar sin cuenta en este dispositivo</button></form></div>';
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
  if (el.id === 'au-skip') { const a = document.getElementById('auth'); if (a) a.remove(); setSync('local'); return; }
  if (el.id === 'cl-sync') return pushNow();
  if (el.id === 'cl-out') { sb.auth.signOut(); return; }
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
    const had = !!session; session = s;
    if (s) { const a = document.getElementById('auth'); if (a) a.remove(); if (!had) pull().catch(e => { setSync('error', e && e.message); render(); }); }
    else if (had) { lastSnap = null; CTOKEN = null; setSync('local'); authScreen('Cerraste sesión.'); }
  });
  sb.auth.getSession().then(({ data }) => { if (!data.session) authScreen(); });
}
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

