/* ---------- Tarjeta de crédito: las compras quedan en la tarjeta y se pagan desde un bolsillo ---------- */
const isCard = a => !!(a && a.card && a.card.pocket);
const cardOf = id => { const a = accById(id); return isCard(a) ? a : null; };
const cardPocket = a => (a && a.card && accById(a.card.pocket)) ? a.card.pocket : null;
const pendingMoves = () => S.transactions.filter(t => t.type === 'transferencia' && t.pending);
function nextDay(day){ // próxima fecha (hoy incluido) con ese día del mes
  const t = new Date(); t.setHours(12, 0, 0, 0);
  let d = new Date(t.getFullYear(), t.getMonth(), Math.min(day, daysInMonth(t.getFullYear(), t.getMonth())), 12);
  if (d < t) d = new Date(t.getFullYear(), t.getMonth() + 1, Math.min(day, daysInMonth(t.getFullYear(), t.getMonth() + 1)), 12);
  return d;
}
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();

/* gasto con tarjeta pagado desde otro bolsillo: deja pendiente el traslado de ese bolsillo al de la tarjeta */
function syncFund(t){
  const ex = S.transactions.find(x => x.type === 'transferencia' && x.auto === t.id);
  const card = t.type === 'gasto' ? cardOf(t.accountId) : null, pk = cardPocket(card);
  const need = card && pk && t.fund && t.fund !== pk && accById(t.fund);
  if (!need) { if (t.fund && (!card || t.fund === pk)) delete t.fund; if (ex && ex.pending) S.transactions = S.transactions.filter(x => x !== ex); return; }
  const note = 'Para la tarjeta: ' + (t.note || catPath(t.categoryId));
  if (ex) { if (ex.pending) Object.assign(ex, { amount:t.amount, accountId:t.fund, toAccountId:pk, note }); return; }
  S.transactions.push({ id:uid(), type:'transferencia', amount:t.amount, date:t.date, ts:Date.now(), accountId:t.fund, toAccountId:pk, note, src:'tarjeta', auto:t.id, pending:true });
}

/* campo "Se paga con" en el formulario */
function fundField(){
  const card = F.type === 'gasto' ? cardOf(F.accountId) : null; if (!card) return '';
  const pk = cardPocket(card); if (!F.fund) F.fund = pk;
  const opts = S.accounts.filter(a => !a.hidden && !isCard(a) && (a.id === pk || /ahorro/i.test(a.group || '')));
  return '<div class="field"><span class="label">Se paga con</span><div class="cgrid">' + opts.map(a => '<button type="button" class="ctile sm" data-fa="fund" data-id="' + esc(a.id) + '" aria-pressed="' + (F.fund === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div>' +
    (F.fund && F.fund !== pk ? '<p class="note" style="padding:0;margin:4px 0 0">Te queda pendiente pasar el valor de ' + esc(accShort(F.fund)) + ' a ' + esc(accShort(pk)) + ' para pagar la tarjeta.</p>' : '') + '</div>';
}

/* Inicio: traslados pendientes */
function movesCard(){
  const list = pendingMoves(); if (!list.length) return '';
  return '<section class="card"><div class="card-h"><h2>Por mover</h2><span class="pill">' + list.length + '</span></div>' +
    '<p class="insight">Compras con la tarjeta que se pagan desde otro bolsillo. Haz el traslado en Lulo y toca Listo.</p>' +
    list.map(t => '<div class="set"><div class="t"><b>' + money(t.amount) + ' de ' + esc(accShort(t.accountId)) + ' a ' + esc(accShort(t.toAccountId)) + '</b><span>' + esc((t.note || '').replace(/^Para la tarjeta: /, '')) + ' · ' + fmtShort(parseISO(t.date)) + '</span></div><button class="btn sm" type="button" data-movedone="' + esc(t.id) + '">Listo</button></div>').join('') + '</section>';
}

/* Cuentas: resumen de la tarjeta */
function cardSummary(){
  const cards = S.accounts.filter(a => isCard(a) && !a.hidden); if (!cards.length) return '';
  const b = balances();
  return cards.map(a => {
    const pk = cardPocket(a), debt = Math.max(0, -(b[a.id] || 0)), have = b[pk] || 0;
    const mv = pendingMoves().filter(t => t.toAccountId === pk).reduce((s, t) => s + t.amount, 0), left = have + mv - debt;
    const due = a.card.due ? nextDay(a.card.due) : null, cut = a.card.cut ? nextDay(a.card.cut) : null;
    return '<section class="card glow"><div class="card-h"><h2>' + esc(a.name) + '</h2>' + (due ? '<span class="pill">Pago ' + due.getDate() + ' ' + MES[due.getMonth()] + '</span>' : '') + '</div>' +
      '<div class="stats3"><div><span>Debes</span><b class="num">' + money(debt) + '</b></div><div><span>En ' + esc(accShort(pk)) + '</span><b class="num">' + money(have) + '</b></div>' +
      '<div><span>' + (left >= 0 ? 'Te sobran' : 'Te faltan') + '</span><b class="num ' + (left < 0 ? 'neg' : 'pos') + '">' + money(Math.abs(left)) + '</b></div></div>' +
      (mv ? '<p class="note" style="padding:0">Cuenta ' + money(mv) + ' que tienes pendiente por mover a ' + esc(accShort(pk)) + '.</p>' : '') +
      (cut ? '<p class="note" style="padding:0">Próximo corte: ' + cut.getDate() + ' de ' + MESL[cut.getMonth()] + '. Lo de ' + esc(accShort(pk)) + ' después de pagar es lo que te queda libre.</p>' : '') +
      '<div class="two"><button class="btn" type="button" data-cardpay="' + esc(a.id) + '"' + (debt ? '' : ' disabled') + '>Pagar tarjeta</button><button class="btn ghost" type="button" data-foto>Cuadrar con captura</button></div></section>';
  }).join('');
}

/* ----- cuadre de todas las cuentas con una captura del banco ----- */
let FS = null;
const FS_GRANDE = 5000; /* diferencias mayores se revisan antes de ajustar: casi siempre son un movimiento mal anotado */
const fsGrande = r => Math.abs(r.diff) > FS_GRANDE;
function fotoOpen(){ FS = { files:[], res:null, busy:false }; fsDraw(); }
function fsDraw(msg){
  const thumbs = FS.files.map((f, i) => '<span class="thumb"><img alt="Captura ' + (i + 1) + '" src="' + (f._url || (f._url = URL.createObjectURL(f))) + '"><button data-fsrm="' + i + '" aria-label="Quitar">✕</button></span>').join('');
  let h = '<div class="sheet-h"><b id="sheet-title">Cuadrar con una captura</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form fs">';
  if (!FS.res) h += '<p class="insight" style="margin-top:-6px">Toma captura de la pantalla de Lulo donde se ven tus bolsillos, y otra de la tarjeta. La IA lee los saldos y los compara con Caudal.</p>' +
    (thumbs ? '<div class="thumbs">' + thumbs + '</div>' : '') +
    '<div class="two"><label class="btn ghost" style="cursor:pointer">' + (FS.files.length ? 'Agregar otra' : 'Subir capturas') + '<input type="file" id="fs-files" accept="image/*" multiple hidden></label>' +
    '<button class="btn accent" type="button" data-fsgo' + (FS.busy || !FS.files.length ? ' disabled' : '') + '>' + (FS.busy ? 'Leyendo…' : 'Comparar') + '</button></div>';
  h += '<div class="err">' + esc(msg || '') + '</div>';
  if (FS.res) {
    const rows = FS.res, ok = rows.filter(r => !r.diff && !r.done), bad = rows.filter(r => r.diff && !r.done);
    h += '<section class="card" style="padding:12px 16px">' + rows.map((r, i) => '<div class="set"><div class="t"><b>' + esc(r.a.name) + '</b><span>Caudal ' + money(r.cau) + ' · banco ' + money(r.real) + '</span></div>' +
      (r.done ? '<span class="pos">Listo ✓</span>' : !r.diff ? '<span class="pos">Cuadra ✓</span>' : '<span style="display:flex;gap:6px;align-items:center"><b class="num ' + (r.diff < 0 ? 'neg' : 'pos') + '">' + money(r.diff, true) + '</b>' + (fsGrande(r) ? '<button class="btn sm" type="button" data-fsver="' + i + '">Revisar</button>' : '') + '<button class="btn sm' + (fsGrande(r) ? ' ghost' : '') + '" type="button" data-fsadj="' + i + '">Ajustar</button></span>') + '</div>').join('') + '</section>';
    if (FS.missing && FS.missing.length) h += '<p class="note" style="padding:0">No encontré en la captura: ' + esc(FS.missing.join(', ')) + '.</p>';
    const chicas = bad.filter(r => !fsGrande(r)), grandes = bad.filter(fsGrande);
    if (bad.length) h += '<button class="btn accent block" type="button" data-fsall>' + (chicas.length ? 'Ajustar ' + (chicas.length === 1 ? 'la diferencia pequeña' : 'las ' + chicas.length + ' diferencias pequeñas') + ' y marcar lo demás cuadrado' : 'Marcar como cuadradas las que coinciden') + '</button>' +
      '<p class="note" style="padding:0">Diferencias pequeñas en bolsillos suelen ser rendimientos.' + (grandes.length ? ' Las grandes (' + grandes.map(r => accShort(r.a.id)).join(', ') + ') quedan pendientes: tócalas en Revisar para encontrar el movimiento que falta o sobra.' : '') + '</p>';
    else if (ok.length) h += '<button class="btn accent block" type="button" data-fsall>Marcar todo como cuadrado</button>';
  }
  h += '</div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
async function fsRun(){
  const accs = S.accounts.filter(a => !a.hidden);
  const prompt = 'Lee los saldos de las cuentas, bolsillos y tarjetas de crédito que aparecen en estas capturas de una app bancaria colombiana.\n' +
    '- Relaciona cada saldo con una cuenta de la lista por su nombre (los bolsillos suelen verse con el nombre corto y un emoji, por ejemplo "GTC" o "Moto 🛵").\n' +
    '- En tarjetas de crédito usa la "deuda actual" como saldo NEGATIVO; ignora cupo disponible y pago mínimo.\n' +
    '- La app usa coma para miles y punto para decimales ($1,668,855.87 = 1668856). Redondea al peso.\n' +
    '- Nombres parecidos son cuentas distintas (por ejemplo "GTC" y "GTC 2"): compara el nombre completo.\n' +
    '- Solo cuentas que veas con su saldo; no inventes.\n\nCuentas (id | nombre | grupo):\n' + accs.map(a => a.id + ' | ' + a.name + ' | ' + a.group).join('\n') +
    '\n\nResponde SOLO con JSON: {"saldos":[{"accountId":"","saldo":0}]}';
  FS.busy = true; fsDraw();
  try {
    const r = await iaCall(prompt, true, await Promise.all(FS.files.map(shrink))), bal = balances(), seen = new Set();
    FS.res = (r.saldos || []).filter(x => accById(x.accountId) && !seen.has(x.accountId) && seen.add(x.accountId)).map(x => {
      const cau = bal[x.accountId] || 0, real = Math.round(+x.saldo || 0); return { a:accById(x.accountId), cau, real, diff:real - cau };
    });
    FS.missing = [];
    if (!FS.res.length) { FS.res = null; FS.busy = false; return fsDraw('No pude leer saldos en esas capturas. Prueba con la pantalla donde se ven los bolsillos.'); }
  } catch (e) { FS.busy = false; return fsDraw(aiErr(e)); }
  FS.busy = false; fsDraw();
}
function fsMark(r){
  S.transactions.push({ id:uid(), type:'ajuste', amount:r.diff, date:iso(new Date()), ts:Date.now(), accountId:r.a.id, note:'Cuadre de cuenta', src:'cuadre' });
  r.done = true;
}

document.addEventListener('change', e => {
  if (e.target.id !== 'fs-files' || !FS) return;
  FS.files = FS.files.concat(Array.from(e.target.files || [])).slice(0, 4); fsDraw();
});
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.movedone) { e.stopPropagation(); const t = S.transactions.find(x => x.id === d.movedone); if (t) { delete t.pending; t.date = iso(new Date()); t.ts = Date.now(); sortTx(S); save(); render(); toast('Traslado registrado'); } return; }
  if (d.cardpay) { e.stopPropagation(); const a = accById(d.cardpay), pk = cardPocket(a), debt = Math.max(0, -(balances()[a.id] || 0));
    txForm(null); F.type = 'transferencia'; F.accountId = pk; F.toAccountId = a.id; F.amount = debt; F.note = 'Pago tarjeta'; return drawForm(); }
  if (d.foto !== undefined) { e.stopPropagation(); return fotoOpen(); }
  if (!FS || !el.closest('.fs')) return;
  e.stopPropagation();
  if (d.fsrm) { FS.files.splice(+d.fsrm, 1); return fsDraw(); }
  if (d.fsgo !== undefined) return fsRun();
  if (d.fsadj) { fsMark(FS.res[+d.fsadj]); lsSet('foto', iso(new Date())); sortTx(S); save(); render(); return fsDraw(); }
  if (d.fsver) { const r = FS.res[+d.fsver]; FS = null; return accSheet(r.a.id, r.real); } /* el cuadre de esa cuenta trae las pistas */
  if (d.fsall !== undefined) { const pend = FS.res.filter(r => !r.done && fsGrande(r)).length; FS.res.filter(r => !r.done && !fsGrande(r)).forEach(fsMark); lsSet('foto', iso(new Date())); sortTx(S); save(); FS = null; closeSheet(); render(); toast(pend ? 'Cuadradas. Quedan ' + pend + ' por revisar' : 'Cuentas cuadradas'); return dpVolver(); }
}, true);
