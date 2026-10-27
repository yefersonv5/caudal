/* Excedentes con techo: el sobrante de cada periodo se barre entre Excedentes (hasta un techo) y el Ahorro general,
   y un gasto puede pagarse en parte con Excedentes sin descontarse del presupuesto del mes.
   Ajustes en S.settings.exc: { on, techo, pct (porcentaje del sobrante que va a Excedentes), ahorro (cuenta),
   desde (AAAA-MM-DD: la regla vale en los periodos que empiezan después de ese día) }.
   Excedentes es la "Cuenta para lo que sobre" del plan (pl.surplus). */
const EXC_DEF = { on:true, techo:500000, pct:40 };
/* opciones de pago combinado: una compra normal usa Excedentes hasta la mitad; una necesidad, completa */
const EXC_OPC = [[0, 'No'], [25, '25%'], [50, '50%'], [100, 'Todo · necesidad']];
const excRule = () => { const r = S.settings.exc; return r && r.on !== false && r.ahorro && accById(r.ahorro) ? { ...EXC_DEF, ...r } : null; };
const excOn = p => { const r = excRule(); return !!r && !!p && p.s > (r.desde || ''); };
/* gasto pagado con Excedentes (directo o con tarjeta) en un periodo con la regla activa: no gasta del plan */
const pagaExc = (t, pl, p) => !!pl && !!pl.surplus && t.type === 'gasto' && (t.fund || t.accountId) === pl.surplus && excOn(p);

/* cómo se barre un sobrante: pct% a Excedentes sin pasar el techo, el resto al Ahorro general,
   y lo que Excedentes ya tenga por encima del techo también se va al Ahorro general */
function excReparto(pl, left){
  const r = excRule(), bal = balances()[pl.surplus] || 0;
  const aExc = Math.min(Math.max(0, r.techo - bal), Math.floor(left * r.pct / 100 / 1000) * 1000);
  return { aExc, aAhorro:left - aExc, exceso:Math.max(0, bal - r.techo), bal };
}

/* ----- pago combinado en el formulario de gasto ----- */
function excPlan(){
  if (!F || F.type !== 'gasto' || (F.parts || []).length || esDeuda(accById(F.accountId))) return null;
  const p = periodFor(F.date || iso(new Date())), pl = planFor(p);
  return pl && pl.surplus && excOn(p) ? pl : null;
}
/* el gasto entero sale de Excedentes: con tarjeta, si es el bolsillo que la paga; sin tarjeta, si es la cuenta */
const excTodo = pl => (cardOf(F.accountId) ? F.fund : F.accountId) === pl.surplus;
/* parte del gasto que paga Excedentes (0 si no aplica o si lo paga todo) */
function excMonto(){ const pl = excPlan(); return pl && !excTodo(pl) && F.excPct > 0 && F.excPct < 100 ? Math.round(Math.abs(F.amount) * F.excPct / 100) : 0; }
function excNota(pl, total){
  const bal = balances()[pl.surplus] || 0, todo = excTodo(pl), parte = todo ? total : Math.round(total * (F.excPct || 0) / 100);
  if (!parte) return 'Excedentes tiene ' + money(bal) + '.';
  return (todo ? 'Todo' : money(parte)) + ' sale de Excedentes y no se descuenta del presupuesto. ' +
    (parte > bal ? '<b class="neg">Excedentes tiene ' + money(bal) + ': faltan ' + money(parte - bal) + '.</b>' : 'Quedan ' + money(bal - parte) + ' en Excedentes.');
}
function excField(){
  const pl = excPlan(); if (!pl) return '';
  const sel = excTodo(pl) ? 100 : F.excPct || 0;
  return '<div class="field"><span class="label">Usar Excedentes</span><div class="chips">' +
    EXC_OPC.map(([n, l]) => '<button type="button" class="chip" data-excp="' + n + '" aria-pressed="' + (sel === n) + '">' + l + '</button>').join('') + '</div>' +
    '<p class="note" id="f-exc" style="padding:0;margin:4px 0 0">' + excNota(pl, Math.abs(F.amount)) + '</p></div>';
}
/* al abrir un gasto guardado: separa la parte de Excedentes de las demás partes del grupo */
function excCargar(t, sib){
  const p = periodFor(t.date), pl = excOn(p) && planFor(p), x = pl && pl.surplus && (t.fund || t.accountId) !== pl.surplus && sib.find(y => (y.fund || y.accountId) === pl.surplus && y.categoryId === t.categoryId);
  if (!x) return sib;
  F.excId = x.id; F.excPct = Math.round(x.amount / sib.concat(t).reduce((a, y) => a + y.amount, 0) * 100);
  return sib.filter(y => y !== x);
}
/* al guardar: crea o actualiza la parte de Excedentes del grupo; con tarjeta queda pendiente el traslado al bolsillo */
function excGuardar(t, grp, keep){
  const a = excMonto(); if (!a) return;
  const pl = excPlan(), card = cardOf(t.accountId);
  const x = { id:F.excId || uid(), type:'gasto', amount:a, date:t.date, ts:t.ts, accountId:card ? t.accountId : pl.surplus, categoryId:t.categoryId, note:t.note, grp };
  if (card) x.fund = pl.surplus;
  if (t.pending) x.pending = true;
  keep.add(x.id);
  const j = S.transactions.findIndex(y => y.id === x.id); if (j >= 0) S.transactions[j] = x; else S.transactions.push(x);
  syncFund(x);
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-excp]'); if (!el || !F) return; e.stopPropagation();
  syncForm(); const n = +el.dataset.excp, pl = excPlan(); if (!pl) return;
  const card = cardOf(F.accountId);
  if (n === 100) { F.excPct = 0; if (card) F.fund = pl.surplus; else F.accountId = pl.surplus; }
  else { F.excPct = n; if (excTodo(pl)) { if (card) F.fund = cardPocket(card); else F.accountId = pl.from || lastAccount(); } }
  drawForm();
}, true);
document.addEventListener('input', e => {
  if (e.target.id !== 'f-amt') return; const box = $('#f-exc'), pl = box && excPlan(); if (pl) box.innerHTML = excNota(pl, leerPesos(e.target.value));
});

/* ----- tarjeta en el plan: cómo va Excedentes frente a su techo ----- */
function excCard(pl, p, R){
  if (!excOn(p) || !pl.surplus) return '';
  const r = excRule(), bal = balances()[pl.surplus] || 0, mx = Math.max(r.techo, bal, 1);
  return '<section class="card"><div class="card-h"><h2>Excedentes</h2><span class="aside num">techo ' + money(r.techo) + '</span></div>' +
    '<div class="btrack"><div class="fill' + (bal > r.techo ? ' warn' : '') + '" style="width:' + (Math.max(0, bal) / mx * 100).toFixed(1) + '%;background:var(--in)"></div><div class="cap" style="left:calc(' + (r.techo / mx * 100).toFixed(1) + '% - 1px)"></div></div>' +
    '<div class="stats3"><div><span>Tiene</span><b class="num">' + money(bal) + '</b></div><div><span>Usado</span><b class="num">' + money(R.exc) + '</b></div>' +
      '<div><span>' + (bal > r.techo ? 'Pasa del techo' : 'Para el techo') + '</span><b class="num' + (bal > r.techo ? ' warn' : '') + '">' + money(Math.abs(r.techo - bal)) + '</b></div></div>' +
    '<p class="insight">Al cerrar el periodo, ' + r.pct + '% de lo que sobre llega aquí sin pasar del techo; el resto y lo que pase del techo va a ' + esc(accShort(r.ahorro)) + '.</p></section>';
}

/* ----- ajustes de la regla, dentro de la hoja del plan ----- */
function excAjustes(pl){
  const r = { ...EXC_DEF, ...(S.settings.exc || {}) }, on = !!excRule();
  return '<div class="field"><span class="label">Regla de Excedentes</span><div class="chips"><button type="button" class="chip" data-exctog aria-pressed="' + on + '">' + (on ? 'Activa' : 'Inactiva') + '</button></div>' +
    '<span class="tile-s">' + (pl.surplus ? 'El sobrante de cada periodo se reparte entre ' + esc(accShort(pl.surplus)) + ', hasta el techo, y tu ahorro general.' + (on && r.desde ? ' Aplica a los periodos que empiezan después del ' + fmtShort(parseISO(r.desde)) + '.' : '') : 'Elige primero la cuenta para lo que sobre.') + '</span></div>' +
    '<div class="two"><div class="field"><label class="label" for="x-techo">Techo de Excedentes</label><input class="inp num" id="x-techo" inputmode="numeric" value="' + nf.format(r.techo) + '"></div>' +
    '<div class="field"><label class="label" for="x-pct">% del sobrante a Excedentes</label><input class="inp num" id="x-pct" inputmode="numeric" value="' + r.pct + '"></div></div>' +
    '<div class="field"><label class="label" for="x-ahorro">Cuenta de ahorro general</label><select class="inp" id="x-ahorro">' + accOptions(r.ahorro, 'Elige una cuenta') + '</select></div>';
}
function excSet(cambio){ S.settings.exc = { ...EXC_DEF, ...(S.settings.exc || {}), ...cambio }; save(); }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-exctog]'); if (!el || !PF) return; e.stopPropagation();
  const on = !excRule();
  if (on && !(S.settings.exc || {}).ahorro && !$('#x-ahorro').value) return toast('Elige la cuenta de ahorro general');
  excSet(on ? { on:true, ahorro:(S.settings.exc || {}).ahorro || $('#x-ahorro').value, desde:iso(new Date()) } : { on:false });
  render(); planSheet(PF);
}, true);
document.addEventListener('change', e => {
  const t = e.target; if (!/^x-(techo|pct|ahorro)$/.test(t.id)) return;
  if (t.id === 'x-techo') excSet({ techo:leerPesos(t.value) });
  if (t.id === 'x-pct') excSet({ pct:Math.min(100, leerPesos(t.value)) });
  if (t.id === 'x-ahorro') excSet({ ahorro:t.value || null });
  render();
});
document.addEventListener('input', e => { if (e.target.id === 'x-techo') pesosCampo(e.target); });
