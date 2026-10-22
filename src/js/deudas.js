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

/* deudas con saldo pendiente, de la más antigua a la más reciente */
function deudasAbiertas(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'); if (!P && !C) return [];
  const pagos = {};
  for (const x of S.transactions) if (x.type === 'transferencia' && x.src === 'deuda' && x.auto) pagos[x.auto] = (pagos[x.auto] || 0) + x.amount;
  const out = [];
  for (const t of S.transactions) {
    const k = P && t.type === 'gasto' && t.accountId === P.id ? 'pagar' : C && t.type === 'transferencia' && t.toAccountId === C.id && t.src !== 'deuda' ? 'cobrar' : null;
    if (!k) continue;
    const falta = t.amount - (pagos[t.id] || 0);
    if (falta > 0) out.push({ t, k, falta, pagado:pagos[t.id] || 0 });
  }
  return out.sort((a, b) => a.t.date.localeCompare(b.t.date));
}
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

/* ----- tarjeta en Cuentas ----- */
function deudasCard(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'); if (!P && !C) return '';
  const B = balances(), ab = deudasAbiertas(), debes = debesTotal(B), teDeben = C ? Math.max(0, B[C.id] || 0) : 0;
  let h = '<section class="card"><div class="card-h"><h2>Deudas</h2></div>' +
    '<div class="stats3 two-col"><div><span>Debes</span><b class="num' + (debes ? ' neg' : '') + '">' + money(debes) + '</b></div><div><span>Te deben</span><b class="num">' + money(teDeben) + '</b></div></div>';
  if (!ab.length) h += '<p class="insight">No tienes deudas abiertas.</p>';
  else h += '<div>' + ab.map(({ t, k, falta, pagado }) =>
    '<div class="set deuda"><div class="t"><b>' + esc(deudaNombre(t)) + '</b><span>' + (k === 'pagar' ? 'Debes' : 'Te deben') + ' · ' + fmtShort(parseISO(t.date)) + (pagado ? ' · van ' + money(pagado) + ' de ' + money(t.amount) : '') + '</span></div>' +
    '<span class="num">' + money(falta) + '</span><button class="pill solid" data-dpay="' + esc(t.id) + '">' + (k === 'pagar' ? 'Pagar' : 'Me pagó') + '</button></div>').join('') + '</div>';
  return h + '<p class="note" style="padding:0">Lo que debes ya está descontado de tu disponible; lo que te deben no suma hasta que te paguen.</p></section>';
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
  if (!DP || !el.closest('.dpay')) return;
  if (d.dpacc) { e.stopPropagation(); const v = $('#dp-amt').value; DP.acc = d.dpacc; deudaPagarDraw(); $('#dp-amt').value = v; return; }
  if (d.dpgo !== undefined) { e.stopPropagation();
    const v = leerPesos($('#dp-amt').value), { it } = DP, err = m => { $('#dp-err').textContent = m; };
    if (!v) return err('Escribe el valor.'); if (v > it.falta) return err('Es más de lo que falta (' + money(it.falta) + ').'); if (!DP.acc) return err('Elige la cuenta.');
    const D = deudaAcc(it.k), pagar = it.k === 'pagar';
    S.transactions.push({ id:uid(), type:'transferencia', amount:v, date:iso(new Date()), ts:Date.now(), accountId:pagar ? DP.acc : D.id, toAccountId:pagar ? D.id : DP.acc,
      note:(pagar ? 'Pago de deuda' : 'Te pagaron') + ': ' + deudaNombre(it.t), src:'deuda', auto:it.t.id });
    sortTx(S); save(); DP = null; closeSheet(); render();
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
