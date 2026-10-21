/* Consultas y utilidades de análisis: totales, saldos, presupuestos y ritmo de gasto. */
const cat = id => S.categories.find(c => c.id === id);
const accById = id => S.accounts.find(a => a.id === id);
const parentOf = c => (c && c.parentId ? cat(c.parentId) : c);
function totals(p){
  let inc = 0, exp = 0;
  for (const t of S.transactions) if (inP(t, p)) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
  return { inc, exp };
}
function balances(){
  const b = {};
  for (const t of S.transactions) {
    const add = (id, v) => { if (id) b[id] = (b[id] || 0) + v; };
    if (t.type === 'ingreso' || t.type === 'ajuste') add(t.accountId, t.amount);
    else if (t.type === 'gasto') add(t.accountId, -t.amount);
    else if (t.type === 'transferencia' && !t.pending) { add(t.accountId, -t.amount); add(t.toAccountId, t.amount); }
  }
  return b;
}
function expenseBudgetTotal(p){
  const pl = planFor(p || period(ui.offset));
  if (pl) { const pp = p || period(ui.offset); return pl.items.filter(isGastoItem).reduce((a, i) => a + itemBudget(pl, i, pp), 0); }
  return Object.entries(S.budgets || {}).reduce((a, [id, v]) => { const c = cat(id); return a + (c && c.type === 'gasto' && !c.parentId ? v : 0); }, 0);
}
function spentByParent(p, type){
  const m = {};
  for (const t of S.transactions) if (t.type === type && inP(t, p)) {
    const c = cat(t.categoryId); const pc = parentOf(c);
    const k = pc ? pc.id : '_';
    m[k] = m[k] || { total:0, subs:{} }; m[k].total += t.amount;
    const sk = c && c.parentId ? c.id : '_self'; m[k].subs[sk] = (m[k].subs[sk] || 0) + t.amount;
  }
  return m;
}

/* ---------- utilidades de análisis ---------- */
const daysIn = p => Math.round((p.end - p.start) / 864e5) + 1;
const dayIdx = (p, ds) => Math.round((parseISO(ds) - p.start) / 864e5);
function todayIdx(p){ const t = iso(new Date()); if (t < p.s) return -1; if (t > p.e) return daysIn(p) - 1; return dayIdx(p, t); }
/* budgeted: con plan, solo el gasto que cae en algún rubro (lo que se compara con el presupuesto) */
/* presupuesto que se mide por ritmo diario: sin pagos fijos (cadenas, recibos) */
function paceBudget(p){ const pl = planFor(p); return pl ? varBudget(pl, p) : expenseBudgetTotal(p); }
function dailyExp(p, budgeted){
  const a = new Array(daysIn(p)).fill(0), c = new Array(daysIn(p)).fill(0);
  const pl = budgeted ? planFor(p) : null;
  for (const t of S.transactions) { if (t.type !== 'gasto' || !inP(t, p)) continue; if (pl) { const it = itemOfCat(pl, t.categoryId); if (!it || (budgeted === 'var' && isFijo(it))) continue; } const i = dayIdx(p, t.date); a[i] += t.amount; c[i]++; }
  a.counts = c; return a;
}
const cum = a => { let s = 0; return a.map(v => (s += v)); };
const short = v => { const a = Math.abs(v); return a >= 1e6 ? (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M' : a >= 1e3 ? Math.round(v / 1e3) + ' mil' : String(Math.round(v)); };
function niceStep(x){ const e = Math.pow(10, Math.floor(Math.log10(x || 1))); const f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
const longDate = d => DIAL[d.getDay()] + ' ' + d.getDate() + ' de ' + MESL[d.getMonth()];
const userName = () => (S.settings && S.settings.name) || 'Yeferson';
const CH = {};

/* curva monótona: suave sin inventar subidas ni bajadas */
function mono(pts){
  const n = pts.length; if (!n) return ''; if (n === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = dx[i] ? (pts[i + 1][1] - pts[i][1]) / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b; if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; } }
  let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) { const h = dx[i] / 3;
    d += ' C' + (pts[i][0] + h).toFixed(1) + ',' + (pts[i][1] + t[i] * h).toFixed(1) + ' ' + (pts[i + 1][0] - h).toFixed(1) + ',' + (pts[i + 1][1] - t[i + 1] * h).toFixed(1) + ' ' + pts[i + 1][0].toFixed(1) + ',' + pts[i + 1][1].toFixed(1); }
  return d;
}
const DEFS = '<defs><linearGradient id="gSale" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + PAL.lima + '" stop-opacity=".45"/><stop offset="1" stop-color="' + PAL.lima + '" stop-opacity="0"/></linearGradient>' +
  '<filter id="fGlow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>';

