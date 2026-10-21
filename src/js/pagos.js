/* Frecuentes de un toque y pagos programados (suscripciones y cobros fijos). */
/* ----- frecuentes: un toque ----- */
function frequent(type){
  const since = iso(new Date(Date.now() - 90 * 864e5)), g = {};
  for (const t of S.transactions) { if (t.type !== type || !t.note || t.date < since || !t.categoryId) continue;
    const k = norm(t.note) + '|' + t.categoryId + '|' + t.accountId; const e = g[k] = g[k] || { t, n:0, amts:[] }; e.n++; e.amts.push(t.amount); }
  return Object.values(g).filter(e => e.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6).map(e => { const a = e.amts.sort((x, y) => x - y); return { note:e.t.note, categoryId:e.t.categoryId, accountId:e.t.accountId, amount:a[Math.floor(a.length / 2)] }; });
}
let FQ = [];
function freqChips(){
  if (!F || F.id || (F.type !== 'gasto' && F.type !== 'ingreso')) return '';
  FQ = frequent(F.type); if (!FQ.length) return '';
  return '<div class="field"><span class="label">Frecuentes · un toque</span><div class="pills">' + FQ.map((q, i) => '<button type="button" class="pill" data-fq="' + i + '">' + esc(q.note.length > 22 ? q.note.slice(0, 21) + '…' : q.note) + ' · ' + short(q.amount) + '</button>').join('') + '</div></div>';
}

/* ----- pagos programados ----- */
function addMonths(ds, n, day){ const d = parseISO(ds), x = new Date(d.getFullYear(), d.getMonth() + n, 1); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return iso(x); }
function nextOn(day){ const t = new Date(); const x = new Date(t.getFullYear(), t.getMonth(), Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return iso(x) < iso(t) ? addMonths(iso(x), 1, day) : iso(x); }
function runRecurring(){
  const today = iso(new Date()); let n = 0;
  for (const r of (S.recurring || [])) { if (!r.active) continue; let guard = 0;
    while (r.next <= today && guard++ < 24) { S.transactions.push({ id:uid(), type:r.type || 'gasto', amount:r.amount, date:r.next, ts:Date.now(), accountId:r.accountId, categoryId:r.categoryId, note:r.name, src:'programado', auto:r.id }); r.next = addMonths(r.next, 1, r.day); n++; } }
  if (n) { sortTx(S); save(); setTimeout(() => toast(n + (n === 1 ? ' pago programado registrado' : ' pagos programados registrados'), 3000), 700); }
}
function suggestRecurring(){
  const per = [0, -1, -2].map(o => period(o)), g = {};
  for (const t of S.transactions) { if (t.type !== 'gasto' || !t.note || t.auto) continue; const pi = per.findIndex(p => inP(t, p)); if (pi < 0) continue;
    const k = norm(t.note) + '|' + t.categoryId; const e = g[k] = g[k] || { t, ps:new Set(), amts:[], days:[] }; e.ps.add(pi); e.amts.push(t.amount); e.days.push(parseISO(t.date).getDate()); }
  const have = new Set((S.recurring || []).map(r => norm(r.name)));
  return Object.values(g).filter(e => e.ps.size >= 2 && e.amts.length <= e.ps.size + 1 && !have.has(norm(e.t.note))).map(e => {
    const a = e.amts.slice().sort((x, y) => x - y), med = a[Math.floor(a.length / 2)];
    return a.every(v => Math.abs(v - med) <= med * .15) ? { name:e.t.note, amount:med, type:'gasto', categoryId:e.t.categoryId, accountId:e.t.accountId, day:Math.min(28, e.days.sort((x, y) => x - y)[Math.floor(e.days.length / 2)]) } : null;
  }).filter(Boolean).slice(0, 5);
}
let RF = null, SUG = [];
function recForm(r){
  RF = r ? { ...r } : { id:null, name:'', amount:0, type:'gasto', categoryId:'', accountId:lastAccount(), day:new Date().getDate() > 28 ? 28 : new Date().getDate(), active:true };
  const days = Array.from({ length:28 }, (_, i) => '<option' + (i + 1 === RF.day ? ' selected' : '') + '>' + (i + 1) + '</option>').join('');
  openSheet('<div class="sheet-h"><b id="sheet-title">' + (RF.id ? 'Pago programado' : 'Nuevo pago programado') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="recf" novalidate>' +
    '<div class="seg" role="group" aria-label="Tipo"><button type="button" data-rt="gasto" aria-pressed="' + (RF.type === 'gasto') + '">Gasto</button><button type="button" data-rt="ingreso" aria-pressed="' + (RF.type === 'ingreso') + '">Ingreso</button></div>' +
    '<div class="field"><label class="label" for="r-name">Nombre</label><input class="inp" id="r-name" value="' + esc(RF.name) + '" placeholder="Ej. Spotify, Arriendo, Nómina" autocomplete="off"></div>' +
    '<div class="two"><div class="field"><label class="label" for="r-amt">Valor</label><input class="inp num" id="r-amt" inputmode="numeric" value="' + (RF.amount ? nf.format(RF.amount) : '') + '" placeholder="0"></div><div class="field"><label class="label" for="r-day">Día del mes</label><select class="inp" id="r-day">' + days + '</select></div></div>' +
    '<div class="field"><label class="label" for="r-cat">Categoría</label><select class="inp" id="r-cat">' + catOptions(RF.type, RF.categoryId) + '</select></div>' +
    '<div class="field"><label class="label" for="r-acc">Cuenta</label><select class="inp" id="r-acc">' + accOptions(RF.accountId) + '</select></div><div class="err" id="r-err"></div>' +
    '<button class="btn block" type="submit">' + (RF.id ? 'Guardar' : 'Programar') + '</button>' + (RF.id ? '<button class="btn ghost block" type="button" id="r-del">Eliminar pago programado</button>' : '') +
    '<p class="note" style="padding:0">Se registra solo cada mes en ese día, la próxima vez que abras la app.</p></form>');
}
function recSave(){
  const name = $('#r-name').value.trim(), amount = leerPesos($('#r-amt').value), day = +$('#r-day').value, categoryId = $('#r-cat').value, accountId = $('#r-acc').value;
  const err = !name ? 'Escribe un nombre.' : !amount ? 'Escribe el valor.' : !categoryId ? 'Elige una categoría.' : '';
  if (err) { $('#r-err').textContent = err; return; }
  S.recurring = S.recurring || [];
  if (RF.id) { const r = S.recurring.find(x => x.id === RF.id); Object.assign(r, { name, amount, day, categoryId, accountId, type:RF.type }); if (r.day !== RF.day) r.next = nextOn(day); }
  else S.recurring.push({ id:uid(), name, amount, day, categoryId, accountId, type:RF.type, active:true, next:nextOn(day) });
  save(); closeSheet(); runRecurring(); render(); toast(RF.id ? 'Pago actualizado' : 'Pago programado');
}
function upcomingCard(){
  const lim = iso(new Date(Date.now() + 7 * 864e5)), rs = (S.recurring || []).filter(r => r.active && r.next <= lim).sort((a, b) => a.next.localeCompare(b.next)).slice(0, 3);
  if (!rs.length) return '';
  const today = parseISO(iso(new Date()));
  return '<section class="card"><div class="card-h"><h2>Próximos pagos</h2><button class="pill" data-go="ajustes" data-sec="recibos">Gestionar</button></div><div>' + rs.map(r => {
    const dd = Math.round((parseISO(r.next) - today) / 864e5), c = cat(r.categoryId);
    return '<div class="row" style="cursor:default"><div class="ico">' + esc((c && c.emoji) || '•') + '</div><div class="rmain"><b>' + esc(r.name) + '</b><span>' + (dd <= 0 ? 'Hoy' : dd === 1 ? 'Mañana' : 'En ' + dd + ' días') + ' · día ' + r.day + '</span></div><div class="ramt num"><span class="' + (r.type === 'ingreso' ? 'pos' : '') + '">' + money(r.type === 'ingreso' ? r.amount : -r.amount, r.type === 'ingreso') + '</span></div></div>';
  }).join('') + '</div></section>';
}
function recCard(){
  const rs = S.recurring || []; SUG = suggestRecurring();
  let h = '<section class="card"><div class="card-h"><h2>Pagos programados</h2><button class="pill" data-newrec>Nuevo</button></div>';
  h += rs.length ? '<div>' + rs.map(r => '<button class="acc" data-rec="' + esc(r.id) + '"><span class="nm">' + esc(r.name) + '<br><span class="tile-s">Día ' + r.day + ' · próximo ' + fmtShort(parseISO(r.next)) + '</span></span><span class="am num">' + money(r.amount) + '</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>').join('') + '</div>'
    : '<p class="insight">Arriendo, servicios, suscripciones o tu nómina: se registran solos cada mes.</p>';
  if (SUG.length) h += '<span class="label">Parecen fijos en tu historial</span><div class="pills">' + SUG.map((s, i) => '<button class="pill" data-sug="' + i + '">+ ' + esc(s.name.length > 20 ? s.name.slice(0, 19) + '…' : s.name) + ' · ' + short(s.amount) + '</button>').join('') + '</div>';
  return h + '</section>';
}
