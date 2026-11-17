/* Cómo va el mes: un solo bloque en Inicio que junta lo que entró, lo que salió y lo que quedó, con los porcentajes
   de gastos, ahorro y lo que se mantiene en tus cuentas. El arco muestra con el color de gasto lo que ya salió y con el de ingreso lo que te queda de lo que entró.
   La plata de otras personas se muestra aparte dentro del mismo bloque: está en tus cuentas, pero no es tuya. */
const esAhorroAcc = a => !!a && !a.hidden && !esDeuda(a) && !isCard(a) && (!!a.apart || /ahorro/i.test(a.group || ''));
function mesDatos(p){
  const { inc, exp } = totals(p);
  let pasado = 0; /* lo que pasaste de tus cuentas a las de ahorro en el periodo (entre cuentas de ahorro no cuenta) */
  for (const t of S.transactions) if (t.type === 'transferencia' && !t.pending && inP(t, p)) {
    const a = accById(t.accountId), b = accById(t.toAccountId); if (esDeuda(a) || esDeuda(b)) continue;
    pasado += (esAhorroAcc(b) ? t.amount : 0) - (esAhorroAcc(a) ? t.amount : 0);
  }
  const queda = inc - exp, ahorro = Math.max(0, Math.min(pasado, Math.max(0, queda))), mantiene = Math.max(0, queda - ahorro);
  return { inc, exp, queda, ahorro, mantiene, deOtros:ajenaTotales().cuentas };
}
const pctDe = (v, base) => base > 0 ? Math.round(v / base * 100) : 0;
/* arco de medio círculo con brillo: used es la parte gastada (0 a 1). con el color de gasto lo que salió y con el de ingreso lo que queda */
function mesArco(used){
  const f = Math.max(0, Math.min(1, used)), ex = 150 - 120 * Math.cos(Math.PI * f), ey = 140 - 120 * Math.sin(Math.PI * f), d = 'M30 140A120 120 0 0 1 270 140';
  return '<svg viewBox="0 0 300 150" aria-hidden="true"><defs><filter id="mes-glow" filterUnits="userSpaceOnUse" x="-30" y="-30" width="360" height="210"><feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' +
    '<path d="' + d + '" fill="none" style="stroke:var(--track)" stroke-width="12" stroke-linecap="round"/>' +
    (f < 1 ? '<path d="' + d + '" fill="none" style="stroke:var(--in)" stroke-width="12" stroke-linecap="round" filter="url(#mes-glow)"/>' : '') +
    (f > 0 ? '<path d="' + d + '" pathLength="100" fill="none" style="stroke:var(--out)" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + (f * 100).toFixed(2) + ' 100" filter="url(#mes-glow)"/>' : '') +
    (f > 0 && f < 1 ? '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="6" fill="#fff" filter="url(#mes-glow)"/>' : '') + '</svg>';
}
function mesCard(p){
  const d = mesDatos(p), today = iso(new Date()), isCurrent = today >= p.s && today <= p.e, N = daysIn(p), ti = todayIdx(p), budget = expenseBudgetTotal(p);
  const bexp = budget > 0 ? dailyExp(p, true).reduce((a, v) => a + v, 0) : d.exp;
  /* qué mide el arco: la parte de lo que entró que ya salió; sin ingresos, la parte del presupuesto que ya se gastó */
  const modo = d.inc > 0 ? 'ingresos' : budget > 0 ? 'presupuesto' : null;
  const usado = modo === 'ingresos' ? d.exp / d.inc : modo === 'presupuesto' ? bexp / budget : 0, pct = Math.round(usado * 100);
  const est = !modo ? ['', ''] : pct <= 60 ? ['ok', 'Equilibrado'] : pct <= 85 ? ['alto', 'Alto'] : pct <= 100 ? ['mucho', 'Muy alto'] : ['mucho', 'Te pasaste'];
  let h = '<section class="card mes ' + est[0] + '"><div class="card-h"><span class="label">Cómo va el mes</span><span class="pill">' + (isCurrent ? 'Día ' + (ti + 1) + ' de ' + N : 'Cerrado') + '</span></div>';
  if (modo) { const sobra = pct > 100, big = sobra ? pct - 100 : 100 - pct, de = modo === 'ingresos' ? 'lo que entró' : 'el presupuesto';
    h += '<div class="mes-g">' + mesArco(usado) + '<div class="gv"><span class="pct num">' + big + '%</span><span class="cap">' + (sobra ? 'por encima de ' + de : 'de ' + de + ' te queda') + '</span><span class="est">' + est[1] + '</span></div></div>'; }
  else h += '<p class="insight" style="margin:0">Cuando registres ingresos, aquí verás qué parte ya salió y qué parte te queda.</p>';
  h += '<div class="stats3 mes-cols"><div><span><i style="background:var(--ink)"></i>Entró</span><b class="num">' + money(d.inc) + '</b></div>' +
    '<div><span><i style="background:var(--out)"></i>Salió</span><b class="num">' + money(d.exp) + '</b></div>' +
    '<div><span><i style="background:var(--in)"></i>Quedó</span><b class="num' + (d.queda < 0 ? ' neg' : '') + '">' + (d.queda < 0 ? '−' : '') + money(Math.abs(d.queda)) + '</b></div></div>';
  if (d.inc > 0) {
    const g = Math.min(100, pctDe(d.exp, d.inc)), a = pctDe(d.ahorro, d.inc), m = Math.max(0, 100 - g - a);
    h += '<div class="flowbar mes-bar" role="img" aria-label="Gastos ' + g + '%, ahorro ' + a + '%, se mantiene ' + m + '%">' +
      (g ? '<i style="flex:' + g + ';background:var(--out);box-shadow:0 0 12px -1px var(--out)"></i>' : '') + (a ? '<i style="flex:' + a + ';background:var(--move);box-shadow:0 0 12px -1px var(--move)"></i>' : '') + (m ? '<i style="flex:' + m + ';background:var(--in);box-shadow:0 0 12px -1px var(--in)"></i>' : '') + '</div>' +
      '<div class="mes-leg"><div><span><i style="background:var(--out)"></i>Gastos</span><b class="num">' + pctDe(d.exp, d.inc) + '%</b></div>' +
      '<div><span><i style="background:var(--move)"></i>Ahorro</span><b class="num">' + a + '%</b></div>' +
      '<div><span><i style="background:var(--in)"></i>Se mantiene</span><b class="num">' + m + '%</b></div></div>';
    if (d.queda < 0) h += '<p class="note" style="padding:0;margin:0">Gastaste <b>' + money(-d.queda) + '</b> más de lo que entró en este periodo.</p>';
  }
  /* lo que queda para gastar según tu plan, con lo que falta por pagar de fijos */
  if (budget > 0 && isCurrent) {
    const pl = planFor(p), R = pl ? planReal(pl, p) : null, left = pl ? planQueda(pl, p, R) : budget - bexp, daysLeft = N - ti;
    const fx = !pl ? [] : pl.items.filter(i => isFijo(i) && !fijoPaid(R.r[i.id] || 0, itemBudget(pl, i, p))).map(i => ({ i, f:Math.max(0, itemBudget(pl, i, p) - (R.r[i.id] || 0)) })).filter(x => x.f > 0);
    const fijoLeft = fx.reduce((a, x) => a + x.f, 0);
    h += '<div class="mes-queda"><span>Te queda para gastar</span><b class="num' + (left < 0 ? ' neg' : '') + '">' + (left < 0 ? '−' : '') + money(Math.abs(left)) + '</b><small>' + daysLeft + (daysLeft === 1 ? ' día' : ' días') + ' para el cierre</small></div>' +
      (fijoLeft > 0 ? '<p class="note" style="padding:0;margin:0">Incluye ' + money(fijoLeft) + ' de pagos fijos por hacer (' + esc(fx.map(x => x.i.name).join(', ')) + ').</p>' : '') +
      (R && (R.out > 0 || R.fromSaved > 0) ? '<p class="note" style="padding:0;margin:0">' + (R.out > 0 ? 'Fuera del plan: <b class="warn">' + money(R.out) + '</b>' : '') + (R.out > 0 && R.fromSaved > 0 ? ' · ' : '') + (R.fromSaved > 0 ? 'pagado con tus ahorros: ' + money(R.fromSaved) : '') + '</p>' : '');
  }
  if (d.deOtros > 0) h += '<p class="note mes-otros" style="padding:0;margin:0"><b>' + money(d.deOtros) + '</b> en tus cuentas son de otras personas: no cuentan en nada de lo de arriba. <button class="lnk" data-go="personas">Ver personas</button></p>';
  return h + accesos() + '</section>';
}
