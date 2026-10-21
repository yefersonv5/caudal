/* Periodos: el mes de Caudal empieza el día elegido o cuando llega el sueldo. */
/*
   Modo "fijo": del día startDay al día anterior del mes siguiente.
   Modo "sueldo": cada periodo empieza el día en que registras el sueldo. Para no partir el mes por error:
   solo cuenta la categoría de sueldo (no sus subcategorías), montos de al menos 40% del sueldo típico y
   con 24 días o más desde el anterior. Si un mes no se registró, se asume un mes después del anterior.
   Mientras no llegue el sueldo nuevo, el periodo actual sigue abierto. */
const salaryCat = () => S.categories.find(c => c.type === 'ingreso' && !c.parentId && /salari|sueldo|n[oó]mina/i.test(c.name)) || null;
const addMonth = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); if (x.getDate() !== d.getDate()) x.setDate(0); return x; };
const fixedStart = d => { const sd = S.settings.startDay || 1; return d.getDate() >= sd ? new Date(d.getFullYear(), d.getMonth(), sd) : new Date(d.getFullYear(), d.getMonth() - 1, sd); };
var PCACHE = null;
function salaryAnchors(){
  const sc = salaryCat(); if (!sc) return [];
  const tx = S.transactions.filter(t => t.type === 'ingreso' && t.categoryId === sc.id && !t.pending && t.amount > 0);
  if (!tx.length) return [];
  const am = tx.map(t => t.amount).sort((a, b) => a - b), med = am[Math.floor(am.length / 2)];
  const ds = [...new Set(tx.filter(t => t.amount >= med * 0.4).map(t => t.date))].sort(), out = [];
  for (const d of ds) {
    const prev = out[out.length - 1];
    if (prev) { if (Math.round((parseISO(d) - parseISO(prev)) / 864e5) < 24) continue;
      let f = addMonth(parseISO(prev), 1); while (Math.round((parseISO(d) - f) / 864e5) > 15) { out.push(iso(f)); f = addMonth(f, 1); } }
    out.push(d);
  }
  return out;
}
/* inicios de periodo (ISO) desde el primer sueldo hasta el periodo actual; null en modo día fijo */
function periodStarts(){
  const today = iso(new Date()), key = (S.settings.periodMode || '') + '|' + today + '|' + S.transactions.length;
  if (PCACHE && PCACHE.key === key && PCACHE.tx === S.transactions) return PCACHE.v;
  let v = null;
  if (S.settings.periodMode === 'sueldo') {
    const a = salaryAnchors().filter(d => d <= today);
    if (a.length) { v = a;
      /* si el sueldo lleva más de 45 días sin registrarse, se parte por mes */
      let f = addMonth(parseISO(v[v.length - 1]), 1); while (Math.round((parseISO(today) - f) / 864e5) > 15) { v.push(iso(f)); f = addMonth(f, 1); } }
  }
  PCACHE = { key, tx:S.transactions, v }; return v;
}
function mkP(start, end){ start.setHours(0, 0, 0, 0); end.setHours(0, 0, 0, 0); return { start, end, s: iso(start), e: iso(end) }; }
const dayBefore = d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
function periodAt(st, i){
  const L = st.length - 1;
  if (i < 0) { const s0 = parseISO(st[0]); return mkP(addMonth(s0, i), dayBefore(addMonth(s0, i + 1))); }
  if (i < L) return mkP(parseISO(st[i]), dayBefore(parseISO(st[i + 1])));
  const last = parseISO(st[L]), t = parseISO(iso(new Date()));
  let end = dayBefore(addMonth(last, 1)); if (end < t) end = t; /* sigue abierto hasta que llegue el sueldo */
  if (i === L) return mkP(last, end);
  const base = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  return mkP(addMonth(base, i - L - 1), dayBefore(addMonth(base, i - L)));
}
function period(offset){
  const st = periodStarts();
  if (st) return periodAt(st, st.length - 1 + offset);
  const sd = S.settings.startDay || 1, f = fixedStart(new Date()), s2 = new Date(f.getFullYear(), f.getMonth() + offset, sd);
  return mkP(s2, new Date(s2.getFullYear(), s2.getMonth() + 1, sd - 1));
}
const fmtShort = d => d.getDate() + ' ' + MES[d.getMonth()];
const pLabel = p => (S.settings.startDay === 1 && S.settings.periodMode !== 'sueldo' ? MES[p.start.getMonth()] + ' ' + p.start.getFullYear() : fmtShort(p.start) + ' – ' + fmtShort(p.end));
const inP = (t, p) => t.date >= p.s && t.date <= p.e;
