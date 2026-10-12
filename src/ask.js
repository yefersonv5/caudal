/* ---------- Preguntar: Caudal hace las cuentas, la IA interpreta ---------- */
const COP = v => '$' + nf.format(Math.round(v));
function askContext(){
  const p0 = period(0), N = daysIn(p0), ti = todayIdx(p0);
  const L = [];
  L.push('Hoy: ' + iso(new Date()) + '. Periodo actual: ' + p0.s + ' a ' + p0.e + ' (día ' + (ti + 1) + ' de ' + N + '). Los periodos van del día ' + S.settings.startDay + ' al día anterior del mes siguiente.');

  /* 1. resumen por periodo, últimos 12 */
  const pl0 = planFor(p0), saved = pl0 ? savedAccs(pl0) : new Set();
  L.push('\n## Resumen por periodo (ingresos, gastos, guardado en cuentas de ahorro, balance)');
  const per = [];
  for (let k = 0; k >= -11; k--) {
    const p = period(k); let inc = 0, exp = 0, sv = 0, n = 0;
    for (const t of S.transactions) if (inP(t, p)) {
      if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') { exp += t.amount; n++; }
      else if (t.type === 'transferencia' && saved.has(t.toAccountId) && !saved.has(t.accountId)) sv += t.amount;
    }
    if (!inc && !exp && k < 0) continue;
    per.push({ p, exp });
    L.push('- ' + p.s + ' a ' + p.e + (k === 0 ? ' (en curso)' : '') + ': ingresos ' + COP(inc) + ', gastos ' + COP(exp) + ' en ' + n + ' movimientos, guardado ' + COP(sv) + ', balance ' + COP(inc - exp));
  }

  /* 2. gasto por categoría: últimos 6 periodos y promedio */
  const ps = [0, -1, -2, -3, -4, -5].map(period);
  const catM = {};
  for (const t of S.transactions) if (t.type === 'gasto') {
    const i = ps.findIndex(p => inP(t, p)); if (i < 0) continue;
    const c = cat(t.categoryId), pc = parentOf(c);
    const k = (pc ? pc.name : 'Sin categoría') + (c && c.parentId ? ' > ' + c.name : '');
    const kp = pc ? pc.name : 'Sin categoría';
    for (const key of new Set([kp, k])) { catM[key] = catM[key] || [0, 0, 0, 0, 0, 0]; catM[key][i] += t.amount; }
  }
  const live = ps.map(p => S.transactions.some(t => t.type === 'gasto' && inP(t, p)));
  const nClosed = Math.max(1, live.slice(1).filter(Boolean).length);
  L.push('\n## Gasto por categoría (columnas: actual, -1, -2, -3, -4, -5 periodos; promedio de los ' + nClosed + ' periodos cerrados con datos). "A > B" es subcategoría de A.');
  Object.entries(catM).sort((a, b) => b[1].slice(1).reduce((x, y) => x + y, 0) - a[1].slice(1).reduce((x, y) => x + y, 0)).forEach(([k, v]) => {
    const avg = v.slice(1).reduce((a, b, i) => a + (live[i + 1] ? b : 0), 0) / nClosed;
    L.push('- ' + k + ': ' + v.map(COP).join(' | ') + ' · prom ' + COP(avg));
  });

  /* 3. plan del periodo */
  if (pl0) {
    const R = planReal(pl0, p0);
    L.push('\n## Plan vigente "' + (pl0.name || 'Plan') + '": ingreso planeado ' + COP(pl0.income) + ', ha entrado ' + COP(R.inc) + '. Ritmo esperado hoy: ' + Math.round((ti + 1) / N * 100) + '% del periodo.');
    for (const i of pl0.items) L.push('- ' + i.name + ' (' + i.cls + ', ' + (isGastoItem(i) ? 'gasto en ' + i.cats.map(id => (cat(id) || {}).name).join('/') : 'ahorro por transferencia a ' + accShort(i.acc)) + '): plan ' + COP(itemBudget(pl0, i, p0)) + ((i.every || 1) > 1 ? ' (se paga ' + everyTxt(i.every) + '; aparta ' + COP(i.amount) + ' al mes)' : '') + ', real ' + COP(R.r[i.id]) + ' (' + Math.round(R.r[i.id] / (i.amount || 1) * 100) + '%)');
    L.push('- Gastos fuera del plan: ' + COP(R.out) + (R.fromSaved ? '; pagado con ahorros: ' + COP(R.fromSaved) : ''));
  } else {
    const b = Object.entries(S.budgets || {}).map(([id, v]) => ((cat(id) || {}).name || '') + ' ' + COP(v)).join('; ');
    if (b) L.push('\n## Presupuestos mensuales: ' + b);
  }

  /* 4. saldos */
  const bal = balances();
  L.push('\n## Saldos de cuentas hoy');
  S.accounts.filter(a => !a.hidden).forEach(a => L.push('- ' + a.name + ' (' + a.group + '): ' + COP(bal[a.id] || 0)));

  /* 5. recibos */
  const bs = (S.bills || []).filter(b => b.active !== false);
  if (bs.length) { L.push('\n## Recibos'); bs.forEach(b => { const c = billCycle(b); L.push('- ' + b.name + ': vence el día ' + b.dueDay + ', ' + (c.cy.paid ? 'pagado este mes' : 'pendiente') + ', valor ' + COP(c.amount)); }); }

  /* 6. lo más repetido en notas (últimos 3 periodos) */
  const since = period(-2).s, notes = {};
  for (const t of S.transactions) if (t.type === 'gasto' && t.date >= since && t.note) {
    const k = norm(t.note).replace(/\d+/g, '').replace(/\s+/g, ' ').trim().slice(0, 40); if (!k) continue;
    notes[k] = notes[k] || { n:0, v:0, c:(parentOf(cat(t.categoryId)) || {}).name || '' }; notes[k].n++; notes[k].v += t.amount;
  }
  const top = Object.entries(notes).sort((a, b) => b[1].v - a[1].v).slice(0, 25);
  if (top.length) { L.push('\n## Conceptos más frecuentes desde ' + since + ' (por nota del movimiento)'); top.forEach(([k, x]) => L.push('- ' + k + ' [' + x.c + ']: ' + x.n + ' veces, ' + COP(x.v))); }

  /* 7. detalle de los últimos 90 días */
  const d90 = iso(new Date(Date.now() - 90 * 864e5));
  L.push('\n## Movimientos de los últimos 90 días (fecha,tipo,monto,categoría,cuenta,nota)');
  for (const t of S.transactions) if (t.date >= d90 && t.type !== 'ajuste') {
    const c = cat(t.categoryId), pc = parentOf(c);
    L.push([t.date, t.type, t.amount, pc ? pc.name + (c && c.parentId ? ' > ' + c.name : '') : '', (accById(t.accountId) || {}).name || '', (t.type === 'transferencia' ? 'a ' + ((accById(t.toAccountId) || {}).name || '') + ' ' : '') + (t.note || '')].map(v => String(v).replace(/[,\n]/g, ' ')).join(','));
  }
  return L.join('\n');
}
function askPrompt(q){
  return 'Eres el analista financiero personal de ' + userName() + ', en Bogotá. Responde en español de Colombia, directo y útil, en máximo 8 frases o una lista corta. Cifras como $1.234.567.\n' +
    'Reglas: usa solo los datos de abajo. Las sumas y promedios ya están calculados: úsalos tal cual y no vuelvas a sumar movimientos si la cifra ya aparece en un resumen. Si algo no se puede saber con estos datos, dilo. ' +
    'Cuando ayude, compara con periodos anteriores o con el plan, señala lo que se sale de lo normal y termina con una recomendación concreta. No uses la raya larga. Puedes usar **negrita** y viñetas con "- ".\n\n' +
    'Pregunta: ' + q + '\n\n' + askContext();
}
function mdLite(s){
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>').replace(/^\s*[-•]\s+/gm, '• ');
}
