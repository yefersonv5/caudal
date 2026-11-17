/* Deudas: dos cuentas fijas en el grupo "Deudas", sin personas.
   Por pagar: lo que te prestaron o alguien pagó por ti. Su saldo es negativo y resta de tu disponible.
   Por cobrar: lo que prestaste. Está apartada: no suma a tu disponible hasta que te paguen.
   Cada deuda es un movimiento (un gasto en Por pagar o una transferencia a Por cobrar) y sus pagos son
   transferencias con src 'deuda' y auto = id de la deuda, para saber cuánto falta de cada una. */
const DEUDA = { pagar:{ name:'Por pagar', orden:900 }, cobrar:{ name:'Por cobrar', orden:901 } };
const esDeuda = a => !!(a && a.debt);
const deudaAcc = k => S.accounts.find(a => a.debt === k) || null;
function deudaCrear(k){
  let a = deudaAcc(k); if (a) return a;
  a = { id:uid(), name:DEUDA[k].name, group:'Deudas', order:DEUDA[k].orden, hidden:false, debt:k };
  if (k === 'cobrar') a.apart = true;
  S.accounts.push(a); return a;
}
/* disponible: cuentas visibles que no están apartadas (Por cobrar lo está; Por pagar resta con su saldo negativo) */
const dispTotal = b => S.accounts.filter(a => !a.hidden && !a.apart).reduce((s, a) => s + (b[a.id] || 0), 0);
/* lo que debes: ya está comprometido aunque la plata siga en tu cuenta */
const debesTotal = b => { const P = deudaAcc('pagar'); return P ? Math.max(0, -(b[P.id] || 0)) : 0; };

/* todas las deudas con sus abonos (de la más antigua a la más reciente); las abiertas son las que tienen saldo */
function deudasTodas(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'); if (!P && !C) return [];
  const abonos = {};
  for (const x of S.transactions) if (x.type === 'transferencia' && x.src === 'deuda' && x.auto) (abonos[x.auto] = abonos[x.auto] || []).push(x);
  const out = [];
  for (const t of S.transactions) {
    const k = P && t.type === 'gasto' && t.accountId === P.id ? 'pagar' : C && t.type === 'transferencia' && t.toAccountId === C.id && t.src !== 'deuda' ? 'cobrar' : null;
    if (!k) continue;
    const ab = (abonos[t.id] || []).sort((a, b) => a.date.localeCompare(b.date) || a.ts - b.ts), pagado = ab.reduce((a, x) => a + x.amount, 0);
    out.push({ t, k, abonos:ab, pagado, falta:Math.max(0, t.amount - pagado) });
  }
  return out.sort((a, b) => a.t.date.localeCompare(b.t.date));
}
const deudasAbiertas = () => deudasTodas().filter(x => x.falta > 0);
const deudaNombre = t => t.note || (t.type === 'gasto' ? catPath(t.categoryId) : 'Préstamo');

/* ----- un préstamo descuenta del presupuesto del rubro de donde salió (su categoryId apunta al rubro).
   Si te pagan dentro del mismo periodo, el rubro recupera lo que te devolvieron. ----- */
const esPrestamo = t => t.type === 'transferencia' && t.src !== 'deuda' && esDeuda(accById(t.toAccountId)) && accById(t.toAccountId).debt === 'cobrar';
function prestamoEnPeriodo(t, p){
  if (!t.categoryId || !esPrestamo(t) || !inP(t, p)) return 0;
  const devuelto = S.transactions.filter(x => x.type === 'transferencia' && x.src === 'deuda' && x.auto === t.id && inP(x, p)).reduce((a, x) => a + x.amount, 0);
  return Math.max(0, t.amount - devuelto);
}
/* cuánto cuenta un movimiento en el rubro que le corresponde: gastos (salvo los pagados con Excedentes) y préstamos */
function enRubro(t, pl, p){
  if (t.type === 'gasto') return pagaExc(t, pl, p) ? 0 : t.amount;
  return prestamoEnPeriodo(t, p);
}

/* filas de deudas abiertas con su botón de pago (Cuentas e Inicio) */
const deudaFilas = ab => '<div>' + ab.map(({ t, k, falta, pagado }) =>
  '<div class="set deuda"><button class="t" data-dver="' + esc(t.id) + '"><b>' + esc(deudaNombre(t)) + '</b><span>' + (k === 'pagar' ? 'Debes' : 'Te deben') + ' · ' + fmtShort(parseISO(t.date)) + (pagado ? ' · abonado ' + money(pagado) + ' de ' + money(t.amount) : '') + '</span></button>' +
  '<span class="num">' + money(falta) + '</span><button class="pill solid" data-dpay="' + esc(t.id) + '">' + (k === 'pagar' ? 'Pagar' : 'Me pagó') + '</button></div>').join('') + '</div>';

/* ----- tarjeta en Inicio, encima del saldo: revisar deudas antes del cierre del periodo.
   Sale siempre que haya deudas abiertas; sin deudas, solo en los últimos 5 días como confirmación. ----- */
function deudasInicio(p){
  if (!deudaAcc('pagar') && !deudaAcc('cobrar')) return '';
  const ab = deudasAbiertas(), today = iso(new Date());
  const faltan = today >= p.s && today <= p.e ? Math.round((parseISO(p.e) - parseISO(today)) / 864e5) + 1 : null, cierre = faltan !== null && faltan <= 5;
  if (!ab.length) return cierre ? '<div class="banner"><span><b>Sin deudas abiertas.</b> Llegas al cierre del periodo sin deber ni que te deban.</span></div>' : '';
  const debes = ab.filter(x => x.k === 'pagar').reduce((a, x) => a + x.falta, 0), teDeben = ab.filter(x => x.k === 'cobrar').reduce((a, x) => a + x.falta, 0);
  return '<section class="card"><div class="card-h"><h2>Revisa tus deudas</h2><span class="aside">' + (cierre ? '<b class="warn">' + (faltan === 1 ? 'Hoy cierra el periodo' : 'Faltan ' + faltan + ' días para el cierre') + '</b>' : ab.length + (ab.length === 1 ? ' abierta' : ' abiertas')) + '</span></div>' +
    '<div class="stats3 two-col"><div><span>Debes</span><b class="num' + (debes ? ' neg' : '') + '">' + money(debes) + '</b></div><div><span>Te deben</span><b class="num">' + money(teDeben) + '</b></div></div>' +
    '<p class="note" style="padding:0">' + (cierre ? 'Págalas o cóbralas antes del cierre para que el sobrante del periodo sea real.' : 'Lo que debes ya está descontado; lo que te deben no suma hasta que te paguen.') + '</p>' +
    '<button class="btn ghost block" data-go="cuentas">Ver el detalle y registrar abonos</button></section>';
}

/* ----- tarjeta en Cuentas ----- */
function deudasCard(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'); if (!P && !C) return '';
  const B = balances(), ab = deudasAbiertas(), debes = debesTotal(B), teDeben = C ? Math.max(0, B[C.id] || 0) : 0;
  let h = '<section class="card"><div class="card-h"><h2>Deudas</h2></div>' +
    '<div class="stats3 two-col"><div><span>Debes</span><b class="num' + (debes ? ' neg' : '') + '">' + money(debes) + '</b></div><div><span>Te deben</span><b class="num">' + money(teDeben) + '</b></div></div>';
  for (const [k, tit] of [['pagar', 'Lo que debes'], ['cobrar', 'Lo que te deben']]) { const l = ab.filter(x => x.k === k); if (l.length) h += '<div class="pgroup">' + tit + '<span class="num">' + l.length + '</span></div>' + deudaFilas(l); }
  if (!ab.length) h += '<p class="insight">No tienes deudas abiertas.</p>';
  const sal = deudasTodas().filter(x => !x.falta).reverse();
  if (sal.length) { const ver = ui.dsal ? sal : sal.slice(0, 3);
    h += '<div class="pgroup">Saldadas<span class="num">' + sal.length + '</span></div><div>' + ver.map(({ t, k, abonos }) =>
      '<div class="set deuda"><button class="t" data-dver="' + esc(t.id) + '"><b>' + esc(deudaNombre(t)) + '</b><span>' + (k === 'pagar' ? 'Pagaste' : 'Te pagaron') + ' ' + money(t.amount) + (abonos.length ? ' · saldada el ' + fmtShort(parseISO(abonos[abonos.length - 1].date)) + (abonos.length > 1 ? ' en ' + abonos.length + ' abonos' : '') : '') + '</span></button><span class="pos">✓</span></div>').join('') + '</div>' +
      (sal.length > 3 ? '<button class="btn ghost block" data-dsal>' + (ui.dsal ? 'Ver menos' : 'Ver las ' + sal.length + ' saldadas') + '</button>' : ''); }
  return h + '<p class="note" style="padding:0">Lo que debes ya está descontado de tu disponible; lo que te deben no suma hasta que te paguen.</p></section>';
}

/* ----- hoja de Por pagar o Por cobrar: cada concepto por separado, con su propio pago ----- */
function deudaCuentaSheet(k){
  const pagar = k === 'pagar', todas = deudasTodas().filter(x => x.k === k), ab = todas.filter(x => x.falta), sal = todas.filter(x => !x.falta).reverse();
  const h = '<div class="sheet-h"><b id="sheet-title">' + DEUDA[k].name + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + (pagar ? 'Debes en total' : 'Te deben en total') + '</span><div class="tile-v num">' + money(ab.reduce((a, x) => a + x.falta, 0)) + '</div>' +
    '<span class="tile-s">' + (ab.length ? ab.length + (ab.length === 1 ? ' concepto abierto' : ' conceptos abiertos') + '. Cada uno se ' + (pagar ? 'paga' : 'cobra') + ' por separado, completo o por abonos.' : 'No hay conceptos abiertos.') + '</span></section>' +
    (ab.length ? deudaFilas(ab) : '') +
    (sal.length ? '<div class="pgroup">Saldadas<span class="num">' + sal.length + '</span></div><div>' + sal.slice(0, 10).map(({ t }) => '<div class="set deuda"><button class="t" data-dver="' + esc(t.id) + '"><b>' + esc(deudaNombre(t)) + '</b><span>' + money(t.amount) + ' · ' + fmtShort(parseISO(t.date)) + '</span></button><span class="pos">✓</span></div>').join('') + '</div>' : '') +
    '<p class="note" style="padding:0">Para sumar un concepto nuevo, regístralo ' + (pagar ? 'como gasto con "¿Lo pagó otra persona?"' : 'como transferencia con "¿Es un préstamo?"') + ' y ponle el concepto en la nota.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* ----- detalle de una deuda: concepto, abonos con fecha y cuenta, y lo que falta ----- */
function deudaVerSheet(id){
  const it = deudasTodas().find(x => x.t.id === id); if (!it) return;
  const { t, k, abonos, pagado, falta } = it, pagar = k === 'pagar';
  const h = '<div class="sheet-h"><b id="sheet-title">' + esc(deudaNombre(t)) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + (falta ? (pagar ? 'Te falta pagar' : 'Te falta recibir') : 'Saldada ✓') + '</span><div class="tile-v num">' + money(falta || t.amount) + '</div>' +
    '<span class="tile-s">' + (pagar ? 'Deuda' : 'Préstamo') + ' de ' + money(t.amount) + ' del ' + fmtShort(parseISO(t.date)) + (pagado ? ' · abonado ' + money(pagado) : '') + '</span></section>' +
    '<div><span class="label">Abonos</span>' + (abonos.length ? abonos.map(x => '<div class="set"><div class="t"><b class="num">' + money(x.amount) + '</b><span>' + fmtShort(parseISO(x.date)) + ' · ' + (pagar ? 'desde ' : 'a ') + esc(accShort(pagar ? x.accountId : x.toAccountId)) + '</span></div><button class="pill" data-tx="' + esc(x.id) + '">Editar</button></div>').join('') : '<p class="note" style="padding:0">Aún no hay abonos.</p>') + '</div>' +
    (falta ? '<button class="btn accent block" data-dpay="' + esc(t.id) + '">' + (pagar ? 'Registrar un pago' : 'Registrar lo que te pagaron') + '</button>' : '') +
    '<p class="note" style="padding:0">Puedes pagar el total o abonar por partes; cada abono queda aquí con su fecha.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* ----- pagar una deuda o registrar que te pagaron (también pagos parciales) ----- */
let DP = null;
function deudaPagarSheet(id){
  const it = deudasAbiertas().find(x => x.t.id === id); if (!it) return toast('Esa deuda ya está saldada');
  const pl = planFor(period(0)), pref = (pl && pl.from) || lastAccount();
  DP = { it, acc:accById(pref) && !esDeuda(accById(pref)) ? pref : null };
  deudaPagarDraw();
}
function deudaPagarDraw(){
  const { it, acc } = DP, pagar = it.k === 'pagar';
  const opts = S.accounts.filter(a => !a.hidden && !esDeuda(a) && !isCard(a));
  const h = '<div class="sheet-h"><b id="sheet-title">' + (pagar ? 'Pagar deuda' : 'Te pagaron') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form dpay">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + esc(deudaNombre(it.t)) + '</span><div class="tile-v num">' + money(it.falta) + '</div><span class="tile-s">' + (pagar ? 'Te falta pagar' : 'Te falta recibir') + (it.pagado ? ' · ya van ' + money(it.pagado) + ' de ' + money(it.t.amount) : '') + '</span></section>' +
    '<div class="field"><label class="label" for="dp-amt">Valor</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="dp-amt" inputmode="numeric" class="num" value="' + nf.format(it.falta) + '" style="font-size:28px"></div></div>' +
    '<div class="field"><span class="label">' + (pagar ? 'Sale de' : 'Llega a') + '</span><div class="cgrid">' + opts.map(a => '<button type="button" class="ctile sm" data-dpacc="' + esc(a.id) + '" aria-pressed="' + (acc === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div></div>' +
    '<div class="err" id="dp-err"></div><button class="btn accent block" type="button" data-dpgo>Registrar</button></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.dpay) { e.stopPropagation(); return deudaPagarSheet(d.dpay); }
  if (d.dver) { e.stopPropagation(); return deudaVerSheet(d.dver); }
  if (d.dsal !== undefined) { e.stopPropagation(); ui.dsal = !ui.dsal; return render(); }
  if (!DP || !el.closest('.dpay')) return;
  if (d.dpacc) { e.stopPropagation(); const v = $('#dp-amt').value; DP.acc = d.dpacc; deudaPagarDraw(); $('#dp-amt').value = v; return; }
  if (d.dpgo !== undefined) { e.stopPropagation();
    const v = leerPesos($('#dp-amt').value), { it } = DP, err = m => { $('#dp-err').textContent = m; };
    if (!v) return err('Escribe el valor.'); if (v > it.falta) return err('Es más de lo que falta (' + money(it.falta) + ').'); if (!DP.acc) return err('Elige la cuenta.');
    const D = deudaAcc(it.k), pagar = it.k === 'pagar';
    S.transactions.push({ id:uid(), type:'transferencia', amount:v, date:iso(new Date()), ts:Date.now(), accountId:pagar ? DP.acc : D.id, toAccountId:pagar ? D.id : DP.acc,
      note:(pagar ? 'Pago de deuda' : 'Te pagaron') + ': ' + deudaNombre(it.t), src:'deuda', auto:it.t.id });
    sortTx(S); save(); DP = null; closeSheet(); render(); dpVolver();
    return toast(v === it.falta ? (pagar ? 'Deuda pagada' : 'Préstamo saldado') : 'Abono registrado · faltan ' + money(it.falta - v)); }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'dp-amt') pesosCampo(e.target); });

/* en el formulario de préstamo: de qué presupuesto sale (se guarda como la categoría del rubro) */
function deudaRubro(){
  const pl = planFor(periodFor(F.date || iso(new Date()))); if (!pl) return '';
  const its = pl.items.filter(i => isGastoItem(i) && !isFijo(i)); if (!its.length) return '';
  const sel = F.parent ? itemOfCat(pl, F.sub || F.parent) : null;
  return '<div class="field"><span class="label">¿De qué presupuesto sale?</span><div class="chips">' +
    its.map(i => '<button type="button" class="chip" data-frub="' + esc(i.id) + '" aria-pressed="' + (sel === i) + '">' + esc(i.name) + '</button>').join('') +
    '<button type="button" class="chip" data-frub="" aria-pressed="' + (!!F.rubNo) + '">Ninguno</button></div>' +
    '<span class="tile-s">Mientras esté prestado, lo descuenta de ese presupuesto. Si te pagan en este mismo periodo, lo recupera.</span></div>';
}
/* último rubro usado en un préstamo, para proponerlo de una vez */
const ultimoRubroPrestamo = () => { const t = S.transactions.find(x => esPrestamo(x) && x.categoryId); return t ? t.categoryId : null; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-frub]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  const pl = planFor(periodFor(F.date || iso(new Date()))), it = pl && pl.items.find(i => i.id === el.dataset.frub);
  F.parent = it ? it.cats[0] : null; F.sub = null; F.rubNo = !it; drawForm();
}, true);

/* ----- en el formulario: "Lo pagó otra persona" (gasto) y "Es un préstamo" (transferencia) ----- */
function deudaToggle(){
  if (F.type === 'gasto') { const on = esDeuda(accById(F.accountId));
    return '<button type="button" class="pill pendt" data-fdeuda aria-pressed="' + on + '">' + (on ? '🤝 Lo pagó otra persona: queda en Por pagar' : '🤝 ¿Lo pagó otra persona? Regístralo como deuda') + '</button>'; }
  if (F.type === 'transferencia') { const on = esDeuda(accById(F.toAccountId));
    return '<button type="button" class="pill pendt" data-fdeuda aria-pressed="' + on + '">' + (on ? '🤝 Es un préstamo: queda en Por cobrar' : '🤝 ¿Es un préstamo? Regístralo para que te paguen') + '</button>'; }
  return '';
}
const deudaNota = () => '<p class="note" style="padding:0;margin:0">' + (F.type === 'gasto'
  ? 'Cuenta en tu presupuesto desde hoy y resta de tu disponible. Cuando le pases la plata, págala en Cuentas › Deudas.'
  : 'Sale de tu cuenta y no cuenta en tu disponible. Cuando te devuelvan, márcalo en Cuentas › Deudas.') + '</p>';
document.addEventListener('click', e => {
  const el = e.target.closest('[data-fdeuda]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  if (F.type === 'gasto') {
    if (esDeuda(accById(F.accountId))) F.accountId = F.prevAcc || lastAccount();
    else { F.prevAcc = F.accountId; F.accountId = deudaCrear('pagar').id; F.fund = null; F.excPct = 0; }
  } else if (F.type === 'transferencia') {
    const on = !esDeuda(accById(F.toAccountId));
    F.toAccountId = on ? deudaCrear('cobrar').id : null; F.parent = on ? ultimoRubroPrestamo() : null; F.sub = null; F.rubNo = false;
  }
  drawForm();
}, true);

/* ----- parte de otra persona: pagaste el total, pero una parte era de alguien más ----- 
   El gasto queda solo con tu parte. La parte ajena sale de la misma cuenta hacia Por cobrar, sin categoría,
   así nunca toca tu presupuesto; si ya te la devolvieron, el cobro se registra de una vez y queda saldada.
   Se reconoce por src 'ajena' y el mismo grp del gasto. F.ajena = { on, monto, devuelto, acc, id, pagoId, abonos } */
const ajenaMonto = () => F && F.ajena && F.ajena.on ? F.ajena.monto || 0 : 0;
/* dónde suele llegar lo que te devuelven: al bolsillo que paga la tarjeta, o a la misma cuenta del gasto */
const ajenaCuentaPago = accId => { const c = cardOf(accId); return c ? cardPocket(c) : esDeuda(accById(accId)) ? null : accId; };
function ponTx(x){ const j = S.transactions.findIndex(y => y.id === x.id); if (j >= 0) S.transactions[j] = x; else S.transactions.push(x); }
/* guarda la parte ajena de un gasto ya armado (t trae su grp). Con a.on falso borra la que hubiera. */
function ajenaGuardar(t, a, keep){
  const pagosDe = id => S.transactions.filter(y => y.type === 'transferencia' && y.src === 'deuda' && y.auto === id);
  if (!a || !a.on || !a.monto) { if (a && a.id) { const quitar = new Set(pagosDe(a.id).map(y => y.id)); S.transactions = S.transactions.filter(y => !quitar.has(y.id)); } return; }
  const x = { id:a.id || uid(), type:'transferencia', amount:a.monto, date:t.date, ts:t.ts, accountId:t.accountId, toAccountId:deudaCrear('cobrar').id,
    note:'Parte de otra persona' + (t.note ? ': ' + t.note : ''), src:'ajena', grp:t.grp };
  ponTx(x); if (keep) keep.add(x.id);
  if (a.abonos) return; /* con abonos parciales el cobro se maneja en Cuentas › Deudas */
  if (a.devuelto && a.acc) ponTx({ id:a.pagoId || uid(), type:'transferencia', amount:a.monto, date:t.date, ts:t.ts + 1, accountId:x.toAccountId, toAccountId:a.acc, note:'Te pagaron: ' + x.note, src:'deuda', auto:x.id });
  else if (a.pagoId) S.transactions = S.transactions.filter(y => y.id !== a.pagoId);
}
/* al abrir un gasto guardado: suma la parte ajena al total y recupera si ya te la devolvieron */
function ajenaCargar(t){
  const x = t.grp && S.transactions.find(y => y.grp === t.grp && y.src === 'ajena'); if (!x) return;
  const pagos = S.transactions.filter(y => y.type === 'transferencia' && y.src === 'deuda' && y.auto === x.id), uno = pagos.length === 1 && pagos[0].amount === x.amount ? pagos[0] : null;
  F.ajena = { on:true, monto:x.amount, id:x.id, devuelto:!!uno, acc:uno ? uno.toAccountId : null, pagoId:uno ? uno.id : null, abonos:uno ? 0 : pagos.reduce((s, y) => s + y.amount, 0) };
  F.amount += x.amount;
}
function ajenaNota(total){
  const a = F.ajena, mio = total - (a.monto || 0);
  if (!a.monto) return 'Escribe cuánto era de la otra persona.';
  if (mio <= 0) return '<b class="neg">La parte de la otra persona no puede ser todo el gasto.</b> Si todo era suyo, regístralo como transferencia con "¿Es un préstamo?".';
  return 'Tu gasto: <b>' + money(mio) + '</b>. ' + (a.devuelto ? 'Los ' + money(a.monto) + ' quedan cobrados de una vez.' : 'Los ' + money(a.monto) + ' quedan en Por cobrar hasta que te los devuelva.') + ' No tocan tu presupuesto.';
}
function ajenaField(){
  const a = F.ajena;
  if (!a || !a.on) return '<button type="button" class="pill pendt" data-faj="on" aria-pressed="false">🤝 ¿Una parte es de otra persona?</button>';
  const opts = S.accounts.filter(x => !x.hidden && !esDeuda(x) && !isCard(x));
  return '<div class="field"><button type="button" class="pill pendt" data-faj="on" aria-pressed="true">🤝 Una parte es de otra persona</button>' +
    '<label class="label" for="f-aj">Parte de la otra persona</label><input id="f-aj" class="inp num" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="' + (a.monto ? nf.format(a.monto) : '') + '">' +
    '<p class="note" id="f-ajn" style="padding:0;margin:0">' + ajenaNota(Math.abs(F.amount)) + '</p>' +
    (a.abonos ? '<p class="note" style="padding:0;margin:0">Ya te abonó ' + money(a.abonos) + '; lo que falta se cobra en Cuentas › Deudas.</p>'
      : '<button type="button" class="pill pendt" data-faj="dev" aria-pressed="' + !!a.devuelto + '">' + (a.devuelto ? '✓ Ya te lo devolvió' : '¿Ya te lo devolvió?') + '</button>' +
        (a.devuelto ? '<span class="label">Te llegó a</span><div class="cgrid">' + opts.map(x => '<button type="button" class="ctile sm" data-faja="' + esc(x.id) + '" aria-pressed="' + (a.acc === x.id) + '"><span class="nm">' + esc(accShort(x.id)) + '</span></button>').join('') + '</div>' : '')) + '</div>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-faj],[data-faja]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  const a = F.ajena = F.ajena || { on:false, monto:0 };
  if (el.dataset.faja) a.acc = el.dataset.faja;
  else if (el.dataset.faj === 'on') a.on = !a.on;
  else { a.devuelto = !a.devuelto; if (a.devuelto && !a.acc) a.acc = ajenaCuentaPago(F.accountId); }
  drawForm(); if (a.on && !a.monto) setTimeout(() => { const i = $('#f-aj'); if (i) i.focus(); }, 50);
}, true);
document.addEventListener('input', e => {
  if (e.target.id !== 'f-aj' && e.target.id !== 'f-amt') return; const box = $('#f-ajn'); if (!box) return;
  if (e.target.id === 'f-aj') pesosCampo(e.target);
  F.ajena.monto = leerPesos($('#f-aj').value); box.innerHTML = ajenaNota(leerPesos($('#f-amt').value)); fbudRefrescar();
});
