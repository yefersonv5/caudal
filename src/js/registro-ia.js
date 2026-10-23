/* Registro inteligente: texto, voz, foto y notificaciones del banco; revisión antes de guardar y alertas de presupuesto. */
/*
   Motor local (tu historial) primero; IA cuando hace falta. En esta vista la IA es Claude
   (capacidad "sample"); al alojar la app, aiParse se cambia por la función de Supabase con Gemini. */
const STOP = new Set(['de','la','el','en','y','a','con','para','por','los','las','del','un','una','mi','me','que','al','se','lo','le','su','fue','fueron','hoy','ayer','gaste','gasté','pague','pagué','compre','compré','costo','costó','valor','pesos','plata','pagaron','recibi','consignaron','salio','compre','pague']);
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const topKey = o => { let b = null, v = -1; for (const k in o || {}) if (o[k] > v) { v = o[k]; b = k; } return b; };
let SAMPLE = null, SAMPLE_IMG = false;
const aiOn = () => !!SAMPLE || (cloudAI());
if (window.claude && claude.use) claude.use('sample').then(async s => {
  SAMPLE = s; if (s && s.limits) { try { const l = await s.limits(); SAMPLE_IMG = !!(l && l.images); } catch (_) {} }
  if (ui.view === 'asistente') render();
}).catch(() => {});

function learn(){
  const tok = {}, notes = {};
  for (const t of S.transactions) {
    if ((t.type !== 'gasto' && t.type !== 'ingreso') || !t.categoryId || !t.note) continue;
    const n = norm(t.note); if (!n) continue;
    const k = notes[n] = notes[n] || { n:0, cats:{}, accs:{}, amts:[], note:t.note };
    k.n++; k.cats[t.categoryId] = (k.cats[t.categoryId] || 0) + 1; k.accs[t.accountId] = (k.accs[t.accountId] || 0) + 1; k.amts.push(t.amount);
    for (const w of n.split(' ')) if (w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w)) { const e = tok[w] = tok[w] || {}; e[t.categoryId] = (e[t.categoryId] || 0) + 1; }
  }
  return { tok, notes };
}
function guess(text, type, L){
  const n = norm(text); if (!n) return { cat:null, acc:null };
  if (L.notes[n]) { const c = topKey(L.notes[n].cats), cc = cat(c); if (cc && (!type || cc.type === type)) return { cat:c, acc:topKey(L.notes[n].accs) }; }
  const sc = {};
  for (const w of n.split(' ')) { const e = L.tok[w]; if (!e) continue; const tot = Object.values(e).reduce((a, b) => a + b, 0); for (const c in e) sc[c] = (sc[c] || 0) + e[c] / tot; }
  const nw = new Set(n.split(' '));
  for (const c of S.categories) { if (c.hidden) continue; const cn = norm(c.name); if (cn.length > 2 && (' ' + n + ' ').includes(' ' + cn + ' ')) sc[c.id] = (sc[c.id] || 0) + 2;
    else for (const w of cn.split(' ')) if (w.length >= 4 && !STOP.has(w) && nw.has(w)) sc[c.id] = (sc[c.id] || 0) + 1; }
  let best = null, bv = 0; for (const c in sc) { const cc = cat(c); if (!cc || cc.hidden || (type && cc.type !== type)) continue; if (sc[c] > bv) { bv = sc[c]; best = c; } }
  return { cat:best, acc:null };
}
const AMT = /(\$\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(millones|millon|mill|mil|lucas|luca|k\b|m\b)?/gi;
function amountsIn(s){
  const out = []; let m; AMT.lastIndex = 0;
  while ((m = AMT.exec(s))) {
    const raw = m[2], unit = (m[3] || '').toLowerCase(); let v;
    if (/^\d{1,3}([.\s]\d{3})+$/.test(raw)) v = +raw.replace(/[.\s]/g, ''); else v = parseFloat(raw.replace(',', '.'));
    if (/^mill|^m$/.test(unit)) v *= 1e6; else if (unit === 'mil' || unit === 'k' || unit.startsWith('luca')) v *= 1e3;
    out.push({ v:Math.round(v), unit, i:m.index, len:m[0].length, money:!!m[1] });
  }
  return out;
}
function dateIn(text){
  const n = norm(text), d = new Date(); d.setHours(12);
  if (/\b(anteayer|antier|antes de ayer)\b/.test(n)) d.setDate(d.getDate() - 2);
  else if (/\bayer\b/.test(n)) d.setDate(d.getDate() - 1);
  else {
    const m = String(text).match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
    if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : d.getFullYear(); const x = new Date(y, +m[2] - 1, +m[1], 12); if (!isNaN(x)) { if (!m[3] && x > d) x.setFullYear(y - 1); return iso(x); } }
    const wd = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'].findIndex(w => new RegExp('\\b(el )?' + w + '\\b').test(n));
    if (wd >= 0) { let k = (d.getDay() - wd + 7) % 7; if (k === 0) k = 7; d.setDate(d.getDate() - k); }
  }
  return iso(d);
}
function accountIn(text){
  const n = ' ' + norm(text) + ' ', use = {};
  for (const t of S.transactions) use[t.accountId] = (use[t.accountId] || 0) + 1;
  if (/\b(efectivo|cash|billete)\b/.test(n)) { const a = S.accounts.filter(a => !a.hidden && /efectivo/i.test(a.group)).sort((x, y) => (use[y.id] || 0) - (use[x.id] || 0))[0]; if (a) return a.id; }
  let best = null, bv = 0;
  for (const a of S.accounts) { if (a.hidden) continue;
    const words = norm(a.name).split(' ').filter(w => w.length >= 3 && !['bank','banco','cuenta'].includes(w));
    const hit = words.filter(w => n.includes(' ' + w + ' ')).length; if (!hit) continue;
    const sc = hit * 1000 + (use[a.id] || 0); if (sc > bv) { bv = sc; best = a.id; } }
  return best;
}
const INCOME = /\b(recibiste|recibi|me pagaron|me consignaron|te consignaron|te enviaron|me enviaron|abono|consignacion|deposito|ingreso|nomina|salario|sueldo|prima|reembolso)\b/;

function bankParse(raw){
  const s = String(raw).replace(/\s+/g, ' ').trim(), n = norm(s);
  const verbs = /(compraste|pagaste|transferiste|recibiste|retiraste|realizaste|compra por|transaccion|t deb|t cred|debito|credito)/.test(n) || /\*\s?\d{3,4}/.test(s);
  if (!verbs && !(/(bancolombia|nequi|lulo|davivienda|daviplata|bbva|banco)/.test(n) && s.includes('$'))) return null;
  const last4 = (s.match(/\*\s?(\d{3,4})/) || [])[1] || null;
  const clean = s.replace(/\*\s?\d+/g, ' ').replace(/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  const am = amountsIn(clean).filter(a => !/(saldo|disponible)[^$]{0,25}$/i.test(clean.slice(Math.max(0, a.i - 30), a.i)) && a.v >= 100);
  const pick = am.find(a => a.money) || am[0]; if (!pick) return null;
  const income = INCOME.test(n);
  let merchant = '';
  const mEn = s.match(/\ben\s+([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ&'. -]{2,40}?)(?=\s+(?:con|el|desde|por|a las)\b|[.,]|$)/);
  const mA = s.match(/\ba\s+(?:la cuenta\s+|nombre de\s+)?([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ&'. -]{3,40}?)(?=\s+(?:el|desde|por|a las)\b|[.,]|$)/);
  const mDe = s.match(/\bde\s+([A-Za-z0-9ÁÉÍÓÚÑáéíóúñ&'. -]{3,40}?)(?=\s+(?:el|en|a las)\b|[.,]|$)/);
  if (income && mDe) merchant = mDe[1]; else if (mEn) merchant = mEn[1]; else if (/transfer/.test(n) && mA && !/^la cuenta/.test(mA[1])) merchant = 'Transferencia a ' + mA[1];
  if (!merchant && /transfer/.test(n)) merchant = 'transferencia enviada';
  merchant = merchant.replace(/\s+/g, ' ').trim();
  const L = learn(), type = income ? 'ingreso' : 'gasto';
  const g = guess(merchant || s, type, L);
  const bankAcc = accountIn(s);
  return { type, amount:pick.v, date:dateIn(s), note:merchant ? merchant.replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase()) : (income ? 'Ingreso bancario' : 'Movimiento bancario'),
    categoryId:g.cat, accountId:(last4 && S.cardMap && S.cardMap[last4]) || bankAcc || g.acc || lastAccount(), last4, src:'banco' };
}
function localParse(text){
  const bank = bankParse(text); if (bank) return [bank];
  const L = learn(), date = dateIn(text);
  const raw = String(text).replace(/\n+/g, ' , ');
  let parts = raw.split(/\s*(?:,|;|\+|\sy\s|\se\s|\sademas\s|\sademás\s)\s*/i).map(x => x.trim()).filter(Boolean);
  const merged = [];
  for (const p of parts) { if (amountsIn(p.replace(/\b\d{1,2}[\/-]\d{1,2}\b/g, ' ')).length || !merged.length) merged.push(p); else merged[merged.length - 1] += ' ' + p; }
  const items = [];
  for (const p of merged) {
    const clean = p.replace(/\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/g, ' ');
    const am = amountsIn(clean); if (!am.length) continue;
    const a = am[am.length - 1]; let v = a.v; if (!a.unit && !a.money && v > 0 && v < 1000) v *= 1000;
    let note = (clean.slice(0, a.i) + ' ' + clean.slice(a.i + a.len)).replace(/\$/g, ' ');
    const accId = accountIn(note);
    note = note.split(/\s+/).filter(w => { const k = norm(w); return k && !STOP.has(k) && !['ayer','anteayer','antier','efectivo','tarjeta','nequi','lulo','wallet','box','bank','con','en'].includes(k) && !/^(el|lunes|martes|miercoles|jueves|viernes|sabado|domingo)$/.test(k); }).join(' ').trim();
    const type = INCOME.test(norm(p)) ? 'ingreso' : 'gasto';
    const g = guess(note, type, L);
    items.push({ type, amount:v, date, note:note ? note[0].toUpperCase() + note.slice(1) : '', categoryId:g.cat, accountId:accId || g.acc || lastAccount(), src:'texto' });
  }
  return items;
}
function catList(){
  return S.categories.filter(c => !c.hidden).map(c => { const p = c.parentId ? cat(c.parentId) : null; return c.id + ' | ' + c.type + ' | ' + (p ? p.name + ' > ' : '') + c.name; }).join('\n');
}
function clean1(x, L){
  const type = ['gasto','ingreso','transferencia'].includes(x && x.type) ? x.type : 'gasto';
  const amount = Math.round(Math.abs(+(x && x.amount) || 0)); if (!amount) return null;
  let c = type === 'transferencia' ? null : cat(x.categoryId);
  if (type !== 'transferencia' && (!c || c.type !== type)) c = cat(guess(x.note || '', type, L).cat);
  return { type, amount, date:/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : iso(new Date()), note:String(x.note || '').slice(0, 80),
    categoryId:c ? c.id : null, accountId:accById(x.accountId) ? x.accountId : lastAccount(), toAccountId:accById(x.toAccountId) ? x.toAccountId : null, src:'ia', pending:type !== 'transferencia' && !!x.pending };
}
async function shrink(file){
  try { const bmp = await createImageBitmap(file); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise(r => cv.toBlob(b => r(b || file), 'image/jpeg', .85)); } catch (_) { return file; }
}
async function aiParse(text, files){
  const L = learn(), now = new Date();
  const hint = k => k.note + ' → ' + catPath(topKey(k.cats));
  const freq = Object.values(L.notes).sort((a, b) => b.n - a.n).slice(0, 60), seenN = new Set(freq.map(k => k.note));
  const recent = []; for (let i = 0; i < S.transactions.length && recent.length < 30; i++) { const t = S.transactions[i]; if ((t.type === 'gasto' || t.type === 'ingreso') && t.note && t.categoryId && !seenN.has(t.note)) { seenN.add(t.note); recent.push(t.note + ' → ' + catPath(t.categoryId)); } }
  const hints = freq.map(hint).concat(recent).join('\n');
  const prompt = 'Eres el asistente de registro de una app personal de gastos en Colombia (pesos COP).\n' +
    'Convierte lo que el usuario escribió, dictó, pegó o fotografió en movimientos.\n' +
    'Hoy es ' + DIAL[now.getDay()] + ' ' + iso(now) + '.\n\nReglas:\n' +
    '- amount en pesos enteros. "25 mil" = 25000, "1,5 millones" = 1500000, "25k" = 25000. Un número pequeño sin unidad junto a otros en miles se lee en miles ("taxi 12" = 12000).\n' +
    '- type: gasto, ingreso o transferencia (entre cuentas propias de la lista).\n' +
    '- date en formato YYYY-MM-DD; resuelve "ayer", "el lunes", etc. respecto a hoy.\n' +
    '- categoryId: SOLO un id de la lista de categorías, el más específico que aplique (subcategoría si la hay). null si es transferencia.\n' +
    '- accountId: id de la lista si se menciona o se infiere (efectivo, banco, tarjeta); si no, null. En transferencias usa accountId de origen y toAccountId de destino.\n' +
    '- note: descripción corta en español (comercio o concepto), sin el monto.\n' +
    '- Foto de recibo o factura: un solo movimiento por recibo con el TOTAL pagado, note = nombre del comercio, date = fecha del recibo si aparece.\n' +
    '- Notificación bancaria: monto del movimiento (nunca el saldo disponible), comercio y fecha.\n' +
    '- pending: true si el usuario no está seguro del valor ("como", "más o menos", "aprox", "por ahí", "no me acuerdo bien"); si no, false.\n\n' +
    'Categorías (id | tipo | nombre):\n' + catList() + '\n\nCuentas (id | nombre | grupo):\n' + S.accounts.filter(a => !a.hidden).map(a => a.id + ' | ' + a.name + ' | ' + a.group).join('\n') +
    '\n\nAsí suele clasificar el usuario (nota → categoría):\n' + hints +
    '\n\nResponde SOLO con JSON: {"items":[{"type":"gasto","amount":0,"date":"YYYY-MM-DD","categoryId":"","accountId":null,"toAccountId":null,"note":"","pending":false}]}\n\nContenido del usuario:\n<<<\n' + (text || '(sin texto, ver imagen)') + '\n>>>';
  const opts = { modelTier:files.length ? 'default' : 'quick', cache:false };
  if (files.length) opts.images = await Promise.all(files.map(shrink));
  const r = SAMPLE ? await SAMPLE.json(prompt, opts) : await iaCall(prompt, true, opts.images);
  const arr = Array.isArray(r) ? r : (r && r.items) || [];
  return arr.map(x => clean1(x, L)).filter(Boolean);
}
const aiErr = e => ({ no_credits:'Se acabaron los créditos de la IA. Recárgalos en console.anthropic.com (Billing) y vuelve a intentar.', not_granted:'Para usar la IA acepta el permiso cuando aparezca. Si lo rechazaste, recarga la página.', rate_limited:'Muchas consultas seguidas. Espera un momento y vuelve a intentar.', invalid_json:'No pude leer la respuesta de la IA. Intenta de nuevo.', images_unavailable:'Aquí no puedo enviar fotos a la IA.', image_rejected:'No pude abrir esa imagen. Prueba con una foto JPG o PNG.', cancelled:'Cancelado.' }[e && e.code] || 'No pude conectar con la IA (' + ((e && e.code) || 'error') + ').');

/* ----- hoja de registro con IA ----- */
let SM = null, REC = null;
const MIC = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const SPARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/></svg>';
const EXAMPLES = ['almuerzo 25 mil y taxi 12', 'ayer mercado 180 mil con Lulo', 'me pagaron el salario 4 millones', 'Bancolombia: Compraste $45.900 en EXITO CALLE 80 con tu T.Deb *1234, el 11/10/2026 a las 13:20.'];

function smartOpen(mode){
  SM = { text:SM && !SM.items ? SM.text : '', files:[], items:null, busy:false, origin:'smart' };
  drawSmart();
  if (mode === 'voz') setTimeout(startVoice, 320);
  else if (mode === 'foto') setTimeout(() => { const i = $('#sm-photo'); if (i) i.click(); }, 320);
  else setTimeout(() => { const t = $('#sm-text'); if (t) t.focus(); }, 320);
}
function drawSmart(msg){
  const thumbs = SM.files.map((f, i) => '<span class="thumb"><img alt="Foto ' + (i + 1) + '" src="' + (f._url || (f._url = URL.createObjectURL(f))) + '"><button data-rmph="' + i + '" aria-label="Quitar foto">✕</button></span>').join('');
  const h = '<div class="sheet-h"><b id="sheet-title">Registrar con IA</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<div class="smart"><textarea id="sm-text" rows="3" placeholder="Escribe, dicta o pega la notificación del banco">' + esc(SM.text) + '</textarea>' +
    '<div class="smart-tools"><button class="tool' + (REC ? ' rec' : '') + '" id="sm-mic" aria-label="Dictar por voz">' + MIC + '<span>' + (REC ? 'Escuchando…' : 'Voz') + '</span></button>' +
    '<button class="tool" id="sm-clear" aria-label="Borrar texto">Borrar</button></div></div>' +
    (thumbs ? '<div class="thumbs">' + thumbs + '</div>' : '') +
    '<div class="err" id="sm-err" style="margin-top:0">' + esc(msg || '') + '</div>' +
    '<button class="btn block" id="sm-go"' + (SM.busy ? ' disabled' : '') + '>' + (SM.busy ? 'Leyendo…' : 'Analizar') + '</button>' +
    '<div class="field"><span class="label">Prueba con</span><div class="pills">' + EXAMPLES.map((x, i) => '<button class="pill ex" data-ex="' + i + '">' + esc(x.length > 34 ? 'Notificación de Bancolombia' : x) + '</button>').join('') + '</div></div>' +
    '<p class="note" style="padding:0">Puedes escribir varios a la vez. Uso tu historial para elegir categoría y cuenta, y la IA cuando hace falta o hay una foto. Siempre revisas antes de guardar.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else { $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#sheet').classList.remove('t-gasto', 't-ingreso', 't-transferencia', 't-ajuste'); }
}
function startVoice(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const ta = $('#sm-text');
  const fallback = () => { REC = null; drawSmart('El dictado directo no está disponible aquí. Toca el micrófono de tu teclado y dicta en la caja de texto.'); const t = $('#sm-text'); if (t) t.focus(); };
  if (REC) { try { REC.stop(); } catch (_) {} return; }
  if (!SR || !ta) return fallback();
  try {
    const r = new SR(); r.lang = 'es-CO'; r.interimResults = true; r.continuous = false;
    const base = ta.value ? ta.value.trim() + ', ' : ''; let heard = '';
    r.onresult = e => { heard = Array.from(e.results).map(x => x[0].transcript).join(' '); const t = $('#sm-text'); if (t) t.value = base + heard; SM.text = base + heard; };
    r.onerror = e => { REC = null; if (e.error === 'no-speech') drawSmart('No te escuché. Intenta de nuevo.'); else fallback(); };
    r.onend = () => { const had = REC; REC = null; if (had && heard) { SM.text = base + heard; smartGo(); } else if (SM && !SM.items) drawSmart(); };
    REC = r; r.start(); drawSmart();
  } catch (_) { fallback(); }
}
async function smartGo(force){
  if (!SM || SM.busy) return;
  const ta = $('#sm-text'); if (ta) SM.text = ta.value;
  const text = SM.text.trim();
  if (!text && !SM.files.length) return drawSmart('Escribe algo, dicta o adjunta una foto.');
  let items = [], engine = 'local';
  if (!SM.files.length && !force) items = localParse(text);
  const need = force || SM.files.length || !items.length || items.some(i => i.type !== 'transferencia' && !i.categoryId);
  if (need && aiOn()) {
    SM.busy = true; if (!SM.items) drawSmart(); else drawReview();
    try { const r = await aiParse(text, SM.files); if (r.length) { items = r; engine = 'ia'; } }
    catch (e) { SM.busy = false; if (!items.length) return SM.items ? drawReview(aiErr(e)) : drawSmart(aiErr(e)); }
    SM.busy = false;
  } else if (need && SM.files.length) return drawSmart('Leer fotos necesita la IA, que no está disponible en esta vista.');
  if (!items.length) return SM.items ? drawReview('No encontré movimientos nuevos.') : drawSmart('No encontré montos. Prueba algo como "almuerzo 25 mil".');
  SM.items = items; SM.engine = engine; drawReview();
}
function catOptions(type, sel){
  let o = '<option value="">Elige categoría</option>';
  for (const p of S.categories.filter(c => !c.parentId && c.type === type && (!c.hidden || c.id === sel))) {
    o += '<option value="' + esc(p.id) + '"' + (sel === p.id ? ' selected' : '') + '>' + esc(p.emoji + ' ' + p.name) + '</option>';
    for (const s of S.categories.filter(c => c.parentId === p.id && (!c.hidden || c.id === sel))) o += '<option value="' + esc(s.id) + '"' + (sel === s.id ? ' selected' : '') + '>' + esc('    ' + p.name + ' · ' + s.name) + '</option>';
  }
  return o;
}
const accOptions = (sel, empty) => (empty ? '<option value="">' + empty + '</option>' : '') + S.accounts.filter(a => (!a.hidden && !esDeuda(a)) || a.id === sel).map(a => '<option value="' + esc(a.id) + '"' + (sel === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('');
function isDup(it){
  const d = parseISO(it.date);
  return S.transactions.some(t => t.type === it.type && t.amount === it.amount && Math.abs(parseISO(t.date) - d) <= 864e5 * 1.5);
}
function drawReview(msg){
  const n = SM.items.length;
  const src = SM.origin === 'inbox' ? 'Llegaron desde tus atajos' : SM.engine === 'ia' ? 'Leído con IA' : 'Leído con tu historial';
  let h = '<div class="sheet-h"><b id="sheet-title">Revisa y guarda</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<p class="insight" style="margin-top:-6px">' + n + (n === 1 ? ' movimiento' : ' movimientos') + ' · ' + src + '. Corrige lo que haga falta.</p>';
  SM.items.forEach((it, i) => {
    const tsel = ['gasto','ingreso','transferencia'].map(k => '<option value="' + k + '"' + (it.type === k ? ' selected' : '') + '>' + { gasto:'Gasto', ingreso:'Ingreso', transferencia:'Transferencia' }[k] + '</option>').join('');
    h += '<div class="rv' + (it.err ? ' bad' : '') + '"><div class="rv-top"><select class="rv-type" data-rv="' + i + '" data-f="type" aria-label="Tipo">' + tsel + '</select>' +
      '<div class="rv-amt"><span>$</span><input inputmode="numeric" class="num" data-rv="' + i + '" data-f="amount" value="' + (it.amount ? nf.format(it.amount) : '') + '" aria-label="Valor"></div>' +
      '<button class="x" data-rvdel="' + i + '" aria-label="Descartar">✕</button></div>' +
      (it.type !== 'transferencia' ? '<button type="button" class="pill pendt" data-rvpend="' + i + '" aria-pressed="' + !!it.pending + '">' + (it.pending ? '◐ Por confirmar' : '◐ Marcar por confirmar') + '</button>' : '') +
      '<input class="inp" data-rv="' + i + '" data-f="note" value="' + esc(it.note) + '" placeholder="Descripción" aria-label="Descripción">' +
      (it.type === 'transferencia'
        ? '<div class="two"><select class="inp" data-rv="' + i + '" data-f="accountId" aria-label="Desde">' + accOptions(it.accountId) + '</select><select class="inp" data-rv="' + i + '" data-f="toAccountId" aria-label="Hacia">' + accOptions(it.toAccountId, 'Hacia…') + '</select></div>'
        : (() => { const c = cat(it.categoryId); return gridPicker(it.type, c ? (c.parentId || c.id) : null, c && c.parentId ? c.id : null, !!it._open || !it.categoryId, it._expand, 'rv' + i); })() + rvAccFields(it, i)) +
      '<input class="inp" type="date" data-rv="' + i + '" data-f="date" value="' + it.date + '" aria-label="Fecha">' +
      (it.err ? '<span class="err" style="margin:0">' + esc(it.err) + '</span>' : isDup(it) ? '<span class="dup">Puede estar repetido: ya hay uno igual cerca de esa fecha.</span>' : '') + '</div>';
  });
  h += '<div class="err" style="margin-top:0">' + esc(msg || '') + '</div>';
  h += '<button class="btn block" id="rv-save"' + (n ? '' : ' disabled') + '>Guardar ' + n + (n === 1 ? ' movimiento' : ' movimientos') + '</button>';
  if (SM.origin === 'inbox') h += '<button class="btn ghost block" data-close>Dejar para después</button><p class="note" style="padding:0">Lo que dejes queda en <b>Por revisar</b> en Inicio. Con ✕ descartas uno que no sea tuyo o esté repetido.</p>';
  if (SM.origin === 'smart') h += '<div class="two"><button class="btn ghost" id="rv-back">Volver</button>' + (aiOn() && SM.engine !== 'ia' ? '<button class="btn ghost" id="rv-ai"' + (SM.busy ? ' disabled' : '') + '>' + (SM.busy ? 'Leyendo…' : 'Mejorar con IA') + '</button>' : '<span></span>') + '</div>';
  h += '</div>';
  if ($('#sheet').hidden) openSheet(h); else { const sc = $('#sheet').scrollTop; $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#sheet').scrollTop = sc; }
}
/* cuenta y "se paga con" en la revisión: los mismos botones del registro manual */
function rvAccFields(it, i){
  const accs = S.accounts.filter(a => !a.hidden || a.id === it.accountId);
  let h = '<div class="field"><span class="label">Cuenta</span><div class="cgrid">' + accs.map(a => '<button type="button" class="ctile sm" data-rvacc="' + i + '" data-id="' + esc(a.id) + '" aria-pressed="' + (it.accountId === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div></div>';
  const card = it.type === 'gasto' && cardOf(it.accountId); if (!card) return h;
  const pk = cardPocket(card); if (!it.fund) it.fund = pk;
  const opts = S.accounts.filter(a => !a.hidden && !isCard(a) && (a.id === pk || a.id === it.fund || /ahorro/i.test(a.group || '')));
  return h + '<div class="field"><span class="label">Se paga con</span><div class="cgrid">' + opts.map(a => '<button type="button" class="ctile sm" data-rvfund="' + i + '" data-id="' + esc(a.id) + '" aria-pressed="' + (it.fund === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div>' +
    (it.fund && pk && it.fund !== pk ? '<p class="note" style="padding:0;margin:4px 0 0">Te queda pendiente pasar el valor de ' + esc(accShort(it.fund)) + ' a ' + esc(accShort(pk)) + ' para pagar la tarjeta.</p>' : '') + '</div>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rvacc],[data-rvfund]'); if (!b || !SM || !SM.items) return;
  const it = SM.items[+(b.dataset.rvacc || b.dataset.rvfund)]; if (!it) return;
  if (b.dataset.rvacc !== undefined) { if (it.accountId !== b.dataset.id) { it.accountId = b.dataset.id; it.fund = null; } }
  else it.fund = b.dataset.id;
  drawReview();
});
function reviewSave(){
  let bad = false;
  SM.items.forEach(it => { it.err = '';
    if (!it.amount) it.err = 'Falta el valor.';
    else if (it.type !== 'transferencia' && !it.categoryId) it.err = 'Elige una categoría.';
    else if (it.type === 'transferencia' && (!it.toAccountId || it.toAccountId === it.accountId)) it.err = 'Elige una cuenta de destino distinta.';
    if (it.err) bad = true; });
  if (bad) return drawReview();
  S.cardMap = S.cardMap || {};
  let last = null;
  for (const it of SM.items) {
    const t = { id:uid(), type:it.type, amount:it.amount, date:it.date, ts:Date.now(), accountId:it.accountId, note:(it.note || '').trim(), src:it.src || 'ia' };
    if (it.type === 'transferencia') t.toAccountId = it.toAccountId; else { t.categoryId = it.categoryId; if (it.pending) t.pending = true; }
    if (it.type === 'gasto' && it.fund && cardOf(it.accountId)) t.fund = it.fund;
    S.transactions.push(t); last = t; syncFund(t);
    if (it.last4 && it.accountId) S.cardMap[it.last4] = it.accountId;
    if (it.inboxId) S.inbox = (S.inbox || []).filter(x => x.id !== it.inboxId);
  }
  if (SM.origin === 'inbox') S.inbox = (S.inbox || []).filter(x => !SM.items.some(it => it.inboxId === x.id) && !SM.discarded?.includes(x.id));
  S.lastAccount = last ? last.accountId : S.lastAccount;
  sortTx(S); save();
  const n = SM.items.length, back = SM.retAcc; SM = null; closeSheet(); render();
  if (back) setTimeout(() => accSheet(back), 300);
  toast((last && budgetMsg(last)) || (n + (n === 1 ? ' movimiento guardado' : ' movimientos guardados')), 3200);
}

/* ----- alertas de presupuesto ----- */
function periodFor(ds){
  const st = periodStarts();
  if (st) { let i = st.length - 1; while (i >= 0 && st[i] > ds) i--; while (i < 0 && i > -240 && periodAt(st, i).s > ds) i--;
    if (i === st.length - 1 && ds > periodAt(st, i).e) { while (i < st.length + 240 && periodAt(st, i).e < ds) i++; }
    const p = periodAt(st, i); return { s:p.s, e:p.e }; }
  const sd = S.settings.startDay || 1, d = parseISO(ds);
  const start = d.getDate() >= sd ? new Date(d.getFullYear(), d.getMonth(), sd) : new Date(d.getFullYear(), d.getMonth() - 1, sd);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, sd - 1);
  return { s:iso(start), e:iso(end) };
}
function budgetMsg(t){
  if (!t || t.type !== 'gasto') return '';
  { const pp = periodFor(t.date), pl = planFor(pp);
    if (pl) { const it = itemOfCat(pl, t.categoryId); if (!it || (quietItem(it))) return '';
      const spent = planReal(pl, pp).r[it.id], b = itemBudget(pl, it, pp), before = spent - t.amount;
      if (spent > b) return it.name + ': te pasaste ' + money(spent - b) + ' del plan';
      if (spent / b >= .85 && before / b < .85) return it.name + ': ya usaste el ' + Math.round(spent / b * 100) + '% del plan';
      return ''; } }
  const pc = parentOf(cat(t.categoryId)); if (!pc) return '';
  const b = (S.budgets || {})[pc.id]; if (!b) return '';
  const p = periodFor(t.date);
  const spent = S.transactions.filter(x => x.type === 'gasto' && x.date >= p.s && x.date <= p.e && (parentOf(cat(x.categoryId)) || {}).id === pc.id).reduce((a, x) => a + x.amount, 0);
  const before = spent - t.amount;
  if (spent > b) return pc.name + ': te pasaste ' + money(spent - b) + ' del presupuesto';
  if (spent / b >= .85 && before / b < .85) return pc.name + ': ya usaste el ' + Math.round(spent / b * 100) + '% del presupuesto';
  return '';
}
