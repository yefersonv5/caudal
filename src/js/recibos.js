/* Recibos: pagar unos días antes del vencimiento y ver cuánto rinde la plata mientras tanto. */
/*
   Cada recibo tiene día de vencimiento y cuántos días antes lo pagas. El dinero se queda
   rindiendo en tu cuenta hasta el día de pago; la app calcula ese rendimiento y te recuerda. */
let DL = null;
if (window.claude && claude.use) claude.use('downloads').then(d => { DL = d; }).catch(() => {});
const ymKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1);
const dueIn = (y, m, day) => new Date(y, m, Math.min(day, new Date(y, m + 1, 0).getDate()), 12);
/* recibos que vencen cada mes o cada N meses (every); anchor es un mes en que sí vence, 'AAAA-MM' */
const billAt = (b, k) => dueIn(Math.floor(k / 12), k % 12, b.dueDay);
function billOk(b, k){ const e = +b.every || 1; if (e <= 1 || !b.anchor) return true; const [y, m] = String(b.anchor).split('-').map(Number); const a = y * 12 + m - 1; return ((k - a) % e + e) % e === 0; }
function billCycle(b){
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const e = +b.every || 1; let k = t.getFullYear() * 12 + t.getMonth(); for (let i = 0; i < 12 && !billOk(b, k); i++) k++;
  let due = billAt(b, k);
  const prevDue = billAt(b, k - e);
  const prev = (b.cycles || {})[ymKey(prevDue)];
  if (prev && !prev.paid && prev.amount) due = prevDue;
  else if ((b.cycles || {})[ymKey(due)] && b.cycles[ymKey(due)].paid) due = billAt(b, k + e);
  const pay = new Date(due); pay.setDate(pay.getDate() - (b.lead || 0));
  const key = ymKey(due), cy = (b.cycles || {})[key] || {};
  const dPay = Math.round((pay - t) / 864e5), dDue = Math.round((due - t) / 864e5);
  let state = 'espera', label;
  if (dDue < 0) { state = 'vencida'; label = 'Venció hace ' + (-dDue) + (dDue === -1 ? ' día' : ' días'); }
  else if (dPay <= 0) { state = 'hoy'; label = dPay === 0 ? 'Págala hoy' : 'Págala ya · vence ' + (dDue === 0 ? 'hoy' : 'en ' + dDue + (dDue === 1 ? ' día' : ' días')); }
  else label = 'Págala en ' + dPay + (dPay === 1 ? ' día' : ' días');
  return { due, pay, key, cy, dPay, dDue, state, label, amount:cy.amount || b.estimate || 0, real:!!cy.amount };
}
const rate = () => +(S.settings.rate || 0);
function yieldOn(amount, days){ const r = rate() / 100; return r > 0 && days > 0 ? amount * (Math.pow(1 + r, days / 365) - 1) : 0; }
function billYield(b, c){
  const from = c.cy.arrived ? parseISO(c.cy.arrived) : new Date(c.due.getFullYear(), c.due.getMonth(), c.due.getDate() - 15);
  return yieldOn(c.amount, Math.round((c.pay - from) / 864e5));
}
function earnedThisYear(){
  const y = String(new Date().getFullYear()); let s = 0;
  for (const b of S.bills || []) for (const k in b.cycles || {}) { const c = b.cycles[k]; if (c.paid && c.paidOn && c.arrived && k.startsWith(y)) s += yieldOn(c.amount || 0, Math.round((parseISO(c.paidOn) - parseISO(c.arrived)) / 864e5)); }
  return s;
}

function billsCard(soon){
  const bs = (S.bills || []).filter(b => b.active !== false);
  if (!bs.length) return '';
  let list = bs.map(b => ({ b, c:billCycle(b) })).sort((x, y) => x.c.pay - y.c.pay);
  if (soon) { list = list.filter(x => !x.c.cy.paid && x.c.dPay <= 5); if (!list.length) return ''; }
  const pending = list.filter(x => x.c.state !== 'espera' || x.c.dPay <= 7);
  const total = list.filter(x => x.c.dDue <= 31).reduce((a, x) => a + x.c.amount, 0);
  const earned = earnedThisYear();
  return '<section class="card"><div class="card-h"><h2>Recibos por pagar</h2><span class="aside num">' + money(total) + '</span></div>' +
    (() => { const u = pending.filter(x => x.c.state !== 'espera').length; return '<p class="insight">' + (u ? '<b>' + u + (u === 1 ? ' recibo para pagar ya.' : ' recibos para pagar ya.') + '</b> El resto sigue rindiendo en tu cuenta hasta su día de pago.' : 'Nada por pagar hoy. Cada recibo sigue rindiendo en tu cuenta hasta su día de pago.') + '</p>'; })() +
    '<div>' + list.map(({ b, c }) => { const cc = cat(b.categoryId);
      return '<div class="bill ' + c.state + '"><button class="bill-main" data-bill="' + esc(b.id) + '"><div class="ico">' + esc((cc && cc.emoji) || '•') + '</div><div class="rmain"><b>' + esc(b.name) + '</b><span>' + c.label + ' · vence el ' + c.due.getDate() + ' ' + MES[c.due.getMonth()] + '</span></div><div class="ramt num"><span>' + (c.real ? '' : '≈ ') + money(c.amount) + '</span>' + (c.real ? '' : '<small>sin recibo</small>') + '</div></button>' +
        (c.state !== 'espera' ? '<button class="pill solid" data-billpay="' + esc(b.id) + '">Pagar</button>' : '') + '</div>'; }).join('') + '</div>' +
    (earned > 0 ? '<p class="insight">Este año pagar a tiempo y no antes te ha dejado <b>≈ ' + money(earned) + '</b> en rendimientos.</p>' : '') + '</section>';
}

let BF = null;
/* tipos de recibo comunes: se eligen de una lista y se puede escribir uno nuevo */
const BILL_TYPES = [['Luz','💡','luz energia electricidad enel codensa'],['Agua','💧','agua acueducto'],['Gas','🔥','gas vanti gas natural'],['Internet','🌐','internet wifi fibra'],
  ['Celular','📱','celular telefono movil plan celular'],['Administración','🏢','administracion'],['Televisión','📺','television tv cable'],['Arriendo','🏠','arriendo alquiler']];
const billType = n => BILL_TYPES.find(x => norm(x[0]) === norm(n));
const billEmoji = b => { const c = cat(b.categoryId), t = billType(b.name); return (c && c.emoji) || (t && t[1]) || '🧾'; };
const servicios = () => S.categories.find(c => !c.parentId && c.type === 'gasto' && norm(c.name) === 'servicios');
function billTypeNames(){
  const out = BILL_TYPES.map(x => x[0]), seen = new Set(out.map(norm)), add = n => { if (n && !seen.has(norm(n))) { seen.add(norm(n)); out.push(n); } };
  const sv = servicios(); if (sv) S.categories.filter(c => c.parentId === sv.id && !c.hidden).forEach(c => add(c.name));
  (S.bills || []).forEach(b => add(b.name));
  return out;
}
/* lo que se puede adivinar de un recibo por su nombre y tu historial */
function billGuess(name){
  const t = billType(name), keys = new Set([norm(name), ...(t ? t[2].split(' ') : [])].filter(Boolean)), sv = servicios();
  const cs = S.categories.filter(c => c.type === 'gasto' && !c.hidden && keys.has(norm(c.name)));
  cs.sort((a, b) => ((b.parentId && sv && b.parentId === sv.id) ? 2 : b.parentId ? 1 : 0) - ((a.parentId && sv && a.parentId === sv.id) ? 2 : a.parentId ? 1 : 0));
  const c = cs[0] || null, g = { categoryId:c ? c.id : '', every:norm(name) === 'agua' ? 2 : 1 };
  if (!c) return g;
  const tx = S.transactions.filter(x => x.type === 'gasto' && x.categoryId === c.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (!tx.length) return g;
  const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  g.estimate = Math.round(med(tx.slice(0, 4).map(x => x.amount)) / 1000) * 1000; g.accountId = tx[0].accountId;
  g.dueDay = Math.min(28, med(tx.slice(0, 4).map(x => parseISO(x.date).getDate())) + 2);
  if (tx.length >= 2) { const gaps = tx.slice(0, -1).map((x, i) => (parseISO(x.date) - parseISO(tx[i + 1].date)) / 864e5); g.every = med(gaps) > 45 ? 2 : 1; }
  if (g.every > 1) g.anchor = ymKey(parseISO(tx[0].date));
  return g;
}
const leadTxt = d => d === 0 ? 'El mismo día' : d + (d === 1 ? ' día antes' : ' días antes');
const billEvTxt = e => e > 1 ? 'Cada ' + e + ' meses' : 'Cada mes';
function billFields(){
  const names = billTypeNames(), isOther = BF.name && !names.some(n => norm(n) === norm(BF.name)) || BF._other;
  const taken = new Set((S.bills || []).filter(b => b.id !== BF.id).map(b => norm(b.name)));
  const t = new Date(), m0 = ymKey(t), m1 = ymKey(new Date(t.getFullYear(), t.getMonth() + 1, 1));
  const anc = BF.anchor && billOk(BF, t.getFullYear() * 12 + t.getMonth()) ? m0 : BF.anchor ? m1 : m0;
  const noCat = !BF.categoryId || BF.categoryId === '__new';
  return '<div class="field"><label class="label" for="b-type">¿Qué recibo es?</label><select class="inp" id="b-type">' + (BF.id || BF.name ? '' : '<option value="">Elige uno</option>') +
      names.map(n => { const ty = billType(n), tk = taken.has(norm(n)); return '<option value="' + esc(n) + '"' + (!isOther && norm(n) === norm(BF.name) ? ' selected' : '') + (tk ? ' disabled' : '') + '>' + esc((ty ? ty[1] + ' ' : '') + n + (tk ? ' · ya está' : '')) + '</option>'; }).join('') +
      '<option value="__otro"' + (isOther ? ' selected' : '') + '>+ Otro recibo…</option></select></div>' +
    '<div class="field" id="b-namef"' + (isOther ? '' : ' hidden') + '><label class="label" for="b-name">Nombre del recibo nuevo</label><input class="inp" id="b-name" value="' + esc(isOther ? BF.name : '') + '" placeholder="Ej. Gimnasio, Seguro, Colegio" autocomplete="off"></div>' +
    '<div class="field"><span class="label">¿Cada cuánto llega?</span><div class="pills">' + [1, 2].map(e => '<button type="button" class="pill" data-bevery="' + e + '" aria-pressed="' + ((+BF.every || 1) === e) + '">' + billEvTxt(e) + '</button>').join('') + '</div></div>' +
    '<div class="field" id="b-anchf"' + ((+BF.every || 1) > 1 ? '' : ' hidden') + '><span class="label">El próximo vence en</span><div class="pills">' + [m0, m1].map(k => '<button type="button" class="pill" data-banchor="' + k + '" aria-pressed="' + (anc === k) + '">' + MESL[+k.slice(5) - 1].replace(/^./, c => c.toUpperCase()) + '</button>').join('') + '</div></div>' +
    '<div class="two"><div class="field"><label class="label" for="b-due">Vence el día</label><select class="inp" id="b-due">' + Array.from({ length:31 }, (_, i) => i + 1).map(d => '<option' + (d === BF.dueDay ? ' selected' : '') + '>' + d + '</option>').join('') + '</select></div>' +
    '<div class="field"><label class="label" for="b-lead">Avisarme</label><select class="inp" id="b-lead">' + [0, 1, 2, 3, 4, 5, 7].map(d => '<option value="' + d + '"' + (d === BF.lead ? ' selected' : '') + '>' + leadTxt(d) + '</option>').join('') + '</select></div></div>' +
    '<p class="bsum" id="b-sum"></p>' +
    '<div class="field"><label class="label" for="b-est">Valor aproximado</label><input class="inp num" id="b-est" inputmode="numeric" value="' + (BF.estimate ? nf.format(BF.estimate) : '') + '" placeholder="Opcional, lo que suele llegar"></div>' +
    '<details class="fold" id="b-more"' + (noCat && (BF.name || BF.id) ? ' open' : '') + '><summary>Categoría y cuenta<span id="b-catl">' + esc(noCat ? 'Falta la categoría' : catPath(BF.categoryId)) + '</span></summary><div class="fold-b">' +
    '<div class="field"><label class="label" for="b-cat">Categoría</label><select class="inp" id="b-cat">' + catOptions('gasto', BF.categoryId) + '<option value="__new"' + (BF.categoryId === '__new' ? ' selected' : '') + '>+ Crear una categoría nueva en ' + esc(servicios() ? 'Servicios' : 'gastos') + '</option></select><span class="tile-s">Cuando registras un gasto en esta categoría, el recibo queda pagado solo.</span></div>' +
    '<div class="field"><label class="label" for="b-acc">Se paga desde</label><select class="inp" id="b-acc">' + accOptions(BF.accountId) + '</select></div></div></details>';
}
function billSheet(b){
  BF = b ? JSON.parse(JSON.stringify(b)) : { id:null, name:'', categoryId:'', accountId:lastAccount(), dueDay:20, lead:2, estimate:0, cycles:{}, active:true, every:1, anchor:null };
  const c = BF.id ? billCycle(BF) : null;
  const y = c ? billYield(BF, c) : 0;
  let h = '<div class="sheet-h"><b id="sheet-title">' + (BF.id ? esc(billEmoji(BF) + ' ' + BF.name) : 'Nuevo recibo') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="billf" novalidate>';
  if (c) h += '<section class="card glow" style="padding:16px"><span class="label">' + (c.cy.paid ? 'Pagado' : 'Próximo') + ' · vence el ' + c.due.getDate() + ' de ' + MESL[c.due.getMonth()] + '</span><div class="tile-v">' + (c.cy.paid ? 'Pagado ✓' : c.label) + '</div>' +
    '<span class="tile-s">' + (c.cy.paid ? 'Pagaste ' + money(c.cy.amount || 0) + (c.cy.paidOn ? ' el ' + fmtShort(parseISO(c.cy.paidOn)) : '') + (c.cy.auto ? ', lo vi en tus movimientos' : '') : 'Te aviso el ' + DIAL[c.pay.getDay()].toLowerCase() + ' ' + c.pay.getDate() + ' de ' + MESL[c.pay.getMonth()] + (y >= 1 ? ' · tu dinero rinde ≈ ' + money(y) + ' mientras tanto' : '')) + '</span></section>' +
    (c.cy.paid ? '' : '<div class="field"><label class="label" for="b-amt">¿Ya llegó? Valor de este recibo</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="b-amt" inputmode="numeric" class="num" value="' + (c.cy.amount ? nf.format(c.cy.amount) : '') + '" placeholder="' + (BF.estimate ? nf.format(BF.estimate) + ' aprox.' : 'Cuando llegue') + '" style="font-size:28px"></div></div>' +
    '<button class="btn block" type="button" id="b-pay">Ya lo pagué: registrar el gasto</button><p class="note" style="padding:0;margin-top:-6px">Si lo pagas con el atajo del banco o lo anotas tú, se marca solo.</p>');
  h += BF.id ? '<details class="fold"><summary>Ajustar recibo<span>' + esc(billEvTxt(+BF.every || 1) + ' · vence el ' + BF.dueDay) + '</span></summary><div class="fold-b">' + billFields() + '</div></details>' : billFields();
  h += '<div class="err" id="b-err"></div><button class="btn ' + (BF.id ? 'ghost' : '') + ' block" type="submit">' + (BF.id ? 'Guardar cambios' : 'Crear recibo') + '</button>';
  if (BF.id) h += '<button class="btn ghost block" type="button" id="b-ics">Agregar al calendario del celular</button><button class="btn ghost block" type="button" id="b-del">Eliminar recibo</button>';
  h += '</form>';
  openSheet(h); billLive();
}
/* frase de resumen y campos que dependen de lo elegido */
function billLive(){
  if (!BF || !$('#b-due')) return;
  const tmp = { ...BF, dueDay:+$('#b-due').value, lead:+$('#b-lead').value, cycles:{} }, s = $('#b-sum'); if (!s) return;
  const c = billCycle(tmp), wk = d => iso(d) === iso(new Date()) ? 'hoy' : DIAL[d.getDay()].toLowerCase() + ' ' + d.getDate() + ' de ' + MESL[d.getMonth()];
  const on = typeof AV === 'undefined' || AV.on;
  s.innerHTML = '🔔 Te aviso el <b>' + wk(c.pay) + '</b> a las 9 a. m.' + (iso(c.pay) !== iso(c.due) ? ' Vence el ' + wk(c.due) + '.' : ', el mismo día que vence.') + ((+tmp.every || 1) > 1 ? ' Después, cada ' + tmp.every + ' meses.' : '') +
    (on ? '' : '<br><span class="muted">Para que llegue al celular, activa los avisos en Ajustes › Avisos.</span>');
  const cs = $('#b-cat'), nw = cs && cs.querySelector('option[value="__new"]'), nm = billName();
  if (nw) nw.textContent = '+ Crear «' + (nm || 'nueva') + '» en ' + (servicios() ? 'Servicios' : 'gastos');
  const cl = $('#b-catl'); if (cl && cs) cl.textContent = !cs.value ? 'Falta la categoría' : cs.value === '__new' ? 'Nueva: ' + (nm || '…') : catPath(cs.value);
}
const billName = () => { const t = $('#b-type'); if (!t) return BF.name; return t.value === '__otro' ? ($('#b-name').value || '').trim() : t.value; };
function billPick(){
  const v = $('#b-type').value, other = v === '__otro'; $('#b-namef').hidden = !other; BF._other = other;
  if (other) { setTimeout(() => $('#b-name').focus(), 50); }
  const name = billName(); if (!name) return billLive();
  const g = billGuess(name);
  if (g.categoryId || !BF.id) $('#b-cat').value = g.categoryId || '__new';
  if (g.accountId) $('#b-acc').value = g.accountId;
  if (g.estimate) $('#b-est').value = nf.format(g.estimate);
  if (g.dueDay && !BF.id) $('#b-due').value = g.dueDay;
  billEvery(g.every || 1, g.anchor);
  $('#b-more').open = !g.categoryId;
  billLive();
}
function billEvery(e, anchor){
  BF.every = e; document.querySelectorAll('[data-bevery]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.bevery === e)));
  $('#b-anchf').hidden = e <= 1;
  if (e > 1) { const ks = [...document.querySelectorAll('[data-banchor]')].map(b => b.dataset.banchor);
    let a = anchor || BF.anchor || ks[0]; const ai = k => +k.slice(0, 4) * 12 + +k.slice(5) - 1;
    if (!ks.includes(a)) a = ks.find(k => ((ai(k) - ai(a)) % e + e) % e === 0) || ks[0];
    BF.anchor = a; document.querySelectorAll('[data-banchor]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.banchor === a))); }
  else BF.anchor = null;
}
function readBill(){
  if ($('#b-type')) { BF.name = billName(); BF.dueDay = +$('#b-due').value; BF.lead = +$('#b-lead').value;
    BF.estimate = leerPesos($('#b-est').value); BF.categoryId = $('#b-cat').value; BF.accountId = $('#b-acc').value; }
  const a = $('#b-amt'); if (a) { const v = leerPesos(a.value); const c = billCycle(BF); BF.cycles = BF.cycles || {};
    const cy = BF.cycles[c.key] = BF.cycles[c.key] || {}; if (v && v !== cy.amount) { cy.amount = v; cy.arrived = cy.arrived || iso(new Date()); } }
  if (!BF.name) return 'Elige el recibo o escribe su nombre.';
  if ((S.bills || []).some(b => b.id !== BF.id && norm(b.name) === norm(BF.name))) return 'Ya tienes un recibo de ' + BF.name + '.';
  return !BF.categoryId ? 'Elige una categoría en Categoría y cuenta.' : '';
}
function storeBill(){
  if (BF.categoryId === '__new') { const sv = servicios(), t = billType(BF.name), c = { id:uid(), name:BF.name, emoji:(t && t[1]) || (sv ? sv.emoji : '🧾'), type:'gasto', parentId:sv ? sv.id : null, order:999, hidden:false };
    S.categories.push(c); BF.categoryId = c.id; }
  delete BF._other; delete BF._arm; BF.every = +BF.every || 1; if (BF.every <= 1) BF.anchor = null;
  S.bills = S.bills || []; if (!BF.id) { BF.id = uid(); S.bills.push(BF); } else S.bills[S.bills.findIndex(x => x.id === BF.id)] = BF; save();
}
/* un recibo queda pagado solo cuando aparece un gasto en su categoría cerca de la fecha de pago
   (por ejemplo, el que registra el atajo del banco), sin tener que tocar Pagar */
function billsAutoMatch(){
  let n = 0; const used = new Set();
  for (const b of S.bills || []) for (const k in b.cycles || {}) if (b.cycles[k].txId) used.add(b.cycles[k].txId);
  for (const b of S.bills || []) {
    if (b.active === false || !b.categoryId) continue;
    const c = billCycle(b); if (c.cy.paid) continue;
    const from = iso(new Date(c.due.getTime() - 26 * 864e5)), to = iso(new Date());
    const t = S.transactions.find(x => x.type === 'gasto' && !x.pending && x.categoryId === b.categoryId && x.date >= from && x.date <= to && !used.has(x.id));
    if (!t) continue;
    b.cycles = b.cycles || {}; const cy = b.cycles[c.key] = b.cycles[c.key] || {};
    Object.assign(cy, { amount:t.amount, paid:true, paidOn:t.date, txId:t.id, arrived:cy.arrived || null, auto:true }); used.add(t.id); n++;
  }
  return n;
}
function payBill(b){
  const c = billCycle(b), amount = c.amount;
  if (!amount) { billSheet(b); setTimeout(() => { const e = $('#b-err'); if (e) e.textContent = 'Escribe el valor del recibo para registrarlo.'; const i = $('#b-amt'); if (i) i.focus(); }, 300); return; }
  const t = { id:uid(), type:'gasto', amount, date:iso(new Date()), ts:Date.now(), accountId:b.accountId || lastAccount(), categoryId:b.categoryId, note:'Pago ' + b.name.toLowerCase(), src:'recibo' };
  S.transactions.push(t); sortTx(S);
  b.cycles = b.cycles || {}; const cy = b.cycles[c.key] = b.cycles[c.key] || {};
  Object.assign(cy, { amount, paid:true, paidOn:t.date, txId:t.id, arrived:cy.arrived || null });
  save(); closeSheet(); render();
  const y = cy.arrived ? yieldOn(amount, Math.round((parseISO(t.date) - parseISO(cy.arrived)) / 864e5)) : 0;
  toast(b.name + ' pagado' + (y >= 1 ? ' · rindió ≈ ' + money(y) : '') , 3000);
}
function icsFor(b){
  const c = billCycle(b), f = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const payDay = b.dueDay - (b.lead || 0);
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Caudal//ES','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    'UID:' + b.id + '@caudal', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART;VALUE=DATE:' + f(c.pay), 'DTEND;VALUE=DATE:' + f(new Date(c.pay.getTime() + 864e5)),
    (payDay >= 1 && b.dueDay <= 28 ? 'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + payDay : 'RRULE:FREQ=MONTHLY') + ((+b.every || 1) > 1 ? ';INTERVAL=' + b.every : ''),
    'SUMMARY:Pagar ' + b.name + ' (vence el ' + b.dueDay + ')',
    'DESCRIPTION:Paga hoy ' + b.name + (b.estimate ? ' (≈ ' + money(b.estimate) + ')' : '') + '. Vence el día ' + b.dueDay + '. Regístralo en Caudal.',
    'BEGIN:VALARM','TRIGGER:PT9H','ACTION:DISPLAY','DESCRIPTION:Pagar ' + b.name,'END:VALARM','END:VEVENT','END:VCALENDAR'];
  return lines.join('\r\n');
}
async function saveIcs(b){
  const data = icsFor(b), filename = 'Pagar ' + b.name + '.ics';
  if (DL) { try { await DL.save({ filename, data }); toast('Abre el archivo para agregarlo a tu calendario', 3200); } catch (e) { if (e && e.code !== 'cancelled') toast('No se pudo guardar el recordatorio'); } return; }
  try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type:'text/calendar' })); a.download = filename; a.click(); toast('Recordatorio listo para tu calendario'); }
  catch (_) { toast('Este navegador no permite guardar el archivo'); }
}
function billSuggestions(){
  const have = new Set((S.bills || []).map(b => b.categoryId));
  const serv = S.categories.find(c => !c.parentId && norm(c.name) === 'servicios');
  const subs = serv ? S.categories.filter(c => c.parentId === serv.id && !c.hidden && !have.has(c.id)) : [];
  return subs.map(c => { const tx = S.transactions.filter(t => t.categoryId === c.id).slice(0, 4); const a = tx.map(t => t.amount).sort((x, y) => x - y);
    return { name:c.name, categoryId:c.id, accountId:tx[0] ? tx[0].accountId : lastAccount(), estimate:a.length ? a[Math.floor(a.length / 2)] : 0 }; });
}
let BSUG = [];
function billsAdminCard(){
  const bs = S.bills || []; BSUG = billSuggestions();
  let h = '<section class="card" id="set-recibos"><div class="card-h"><h2>Recibos y vencimientos</h2>' + (bs.length ? '<span class="aside">' + bs.length + (bs.length === 1 ? ' recibo' : ' recibos') + '</span>' : '') + '</div>';
  if (!bs.length) h += '<p class="insight">Agrega luz, agua, gas o internet. Te aviso el día que toca pagar y, cuando registras el pago, el recibo queda al día solo.</p>';
  else h += '<div>' + bs.map(b => { const c = billCycle(b), paid = c.cy.paid;
    const st = paid ? '<span class="bst ok">Pagado ✓</span>' : c.state !== 'espera' ? '<span class="bst due">' + esc(c.label) + '</span>' : '<span class="bst">' + esc(c.label.replace('Págala en', 'En')) + '</span>';
    return '<button class="brow" data-bill="' + esc(b.id) + '"><span class="ico">' + esc(billEmoji(b)) + '</span><span class="t"><b>' + esc(b.name) + '</b><span>' + ((+b.every || 1) > 1 ? 'Cada ' + b.every + ' meses · ' : '') + 'Vence el ' + b.dueDay + ' · aviso ' + (b.lead ? b.lead + (b.lead === 1 ? ' día antes' : ' días antes') : 'ese día') + '</span></span><span class="r"><span class="num">' + (c.real ? '' : '≈ ') + money(c.amount) + '</span>' + st + '</span></button>'; }).join('') + '</div>';
  if (BSUG.length) h += '<div class="field"><span class="label">Agregar rápido desde tus servicios</span><div class="pills">' + BSUG.map((s, i) => '<button class="pill" data-bsug="' + i + '">+ ' + esc(s.name) + (s.estimate ? ' · ' + short(s.estimate) : '') + '</button>').join('') + '</div></div>';
  h += '<button class="btn block' + (bs.length ? ' ghost' : '') + '" data-newbill>Agregar recibo</button>';
  h += '<div class="set"><div class="t"><b>Rendimiento de tu cuenta</b><span>% efectivo anual, para calcular lo que ganas pagando el día justo.</span></div><input inputmode="decimal" id="b-rate" value="' + (S.settings.rate || '') + '" placeholder="Ej. 9" aria-label="Rendimiento anual" style="width:90px"></div>';
  return h + '</section>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.bill) return billSheet((S.bills || []).find(b => b.id === d.bill));
  if (d.billpay) { const b = (S.bills || []).find(x => x.id === d.billpay); if (b) payBill(b); return; }
  if (d.newbill !== undefined) return billSheet(null);
  if (d.bsug) { const s = BSUG[+d.bsug]; if (!s) return; const g = billGuess(s.name); return billSheet({ id:null, dueDay:g.dueDay || 20, lead:2, cycles:{}, active:true, every:g.every || 1, anchor:g.anchor || null, ...s }); }
  if (!BF) return;
  if (d.bevery) { billEvery(+d.bevery); return billLive(); }
  if (d.banchor) { BF.anchor = d.banchor; document.querySelectorAll('[data-banchor]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); return billLive(); }
  if (el.id === 'b-pay') { const err = readBill(); if (err) { $('#b-err').textContent = err; return; } storeBill(); const b = S.bills.find(x => x.id === BF.id); if (billCycle(b).cy.paid) return toast('Este mes ya está pagado'); return payBill(b); }
  if (el.id === 'b-ics') { const err = readBill(); if (!err) storeBill(); return saveIcs(BF); }
  if (el.id === 'b-del') { if (!BF._arm) { BF._arm = true; el.textContent = 'Toca otra vez para eliminar'; el.className = 'btn danger block'; return; } S.bills = (S.bills || []).filter(b => b.id !== BF.id); save(); closeSheet(); render(); return toast('Recibo eliminado'); }
});
document.addEventListener('change', e => { if (!BF) return; const id = e.target.id; if (id === 'b-type') billPick(); else if (id === 'b-due' || id === 'b-lead' || id === 'b-cat') billLive(); });
document.addEventListener('input', e => { if (BF && e.target.id === 'b-name') billLive(); });
document.addEventListener('submit', e => {
  if (e.target.id !== 'billf') return; e.preventDefault();
  const err = readBill(); if (err) { $('#b-err').textContent = err; return; }
  const isNew = !BF.id; storeBill(); closeSheet(); render(); toast(isNew ? 'Recibo creado' : 'Recibo guardado');
}, true);
document.addEventListener('input', e => { const t = e.target; if (t.id === 'b-amt' || t.id === 'b-est') { pesosCampo(t); } });
document.addEventListener('change', e => { if (e.target.id === 'b-rate') { const v = parseFloat(String(e.target.value).replace(',', '.')); S.settings.rate = v > 0 && v < 100 ? v : 0; save(); toast('Rendimiento guardado'); } });
S.bills = S.bills || [];
