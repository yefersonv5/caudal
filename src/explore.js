/* ---------- Explorar: análisis detallado solo en computador ---------- */
const XCOL = ['#b8709f', '#4d93e0', '#E6B3D6', '#7fb8a4', '#F2B866', '#9a8fd6', '#d98a7a', '#8d858c'];
ui.xopen = ui.xopen || new Set();
function vExplorar(p){
  let out = '<div class="hello"><h1>Explorar <em>a fondo</em></h1><p>Tus números con detalle, para revisar con calma en el computador.</p></div>';
  out += xMonthly() + xWorth() + xExplorer();
  return out;
}

/* ----- 1. mes a mes por categoría ----- */
function xMonthly(){
  const type = ui.xmType || 'gasto', N = 12;
  const ps = []; for (let k = N - 1; k >= 0; k--) ps.push(period(ui.offset - k));
  const idx = t => { for (let i = 0; i < ps.length; i++) if (inP(t, ps[i])) return i; return -1; };
  const rows = {}, tot = new Array(N).fill(0);
  for (const t of S.transactions) {
    if (t.type !== type) continue; const i = idx(t); if (i < 0) continue;
    const c = cat(t.categoryId), pc = parentOf(c), pk = pc ? pc.id : '_', sk = c && c.parentId ? c.id : '_self';
    const r = rows[pk] = rows[pk] || { v:new Array(N).fill(0), subs:{} }; r.v[i] += t.amount;
    const s = r.subs[sk] = r.subs[sk] || new Array(N).fill(0); s[i] += t.amount; tot[i] += t.amount;
  }
  const live = ps.map(q => S.transactions.some(t => inP(t, q))), today = iso(new Date());
  const closed = ps.map((q, i) => live[i] && q.e < today);
  const avg = v => { const n = closed.filter(Boolean).length; return n ? v.reduce((a, x, i) => a + (closed[i] ? x : 0), 0) / n : 0; };
  const spark = v => { const mx = Math.max(1, ...v), w = 64, h = 20; const pts = v.map((x, i) => (i * w / (v.length - 1)).toFixed(1) + ',' + (h - x / mx * h).toFixed(1)).join(' ');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><polyline points="' + pts + '" fill="none" stroke="#d9a3c6" stroke-width="1.5"/></svg>'; };
  const cell = (v, mx, key, i) => { const k = mx ? v / mx : 0;
    return '<td class="num xc" data-xcell="' + esc(key) + '|' + i + '" style="' + (v ? 'background:rgba(184,112,159,' + (.08 + .55 * k).toFixed(2) + ')' : '') + '">' + (v ? short(v) : '·') + '</td>'; };
  const sorted = Object.entries(rows).sort((a, b) => b[1].v.reduce((x, y) => x + y, 0) - a[1].v.reduce((x, y) => x + y, 0));
  let h = '<section class="card xwide"><div class="card-h"><h2>Mes a mes por categoría</h2><div class="pills">' + [['gasto','Gastos'],['ingreso','Ingresos']].map(([k, l]) => '<button class="pill" data-xmtype="' + k + '" aria-pressed="' + (type === k) + '">' + l + '</button>').join('') + '</div></div>' +
    '<p class="insight">Tu antiguo "Control de gastos": cada fila es una categoría y cada columna un periodo. El color es más intenso en el mes en que más gastaste en esa categoría. Toca una fila para ver sus subcategorías y una celda para ver sus movimientos.</p>' +
    '<div class="xscroll"><table class="xt"><thead><tr><th class="xl">Categoría</th>' + ps.map(q => '<th class="num">' + MES[q.end.getMonth()] + '<br><span>' + String(q.end.getFullYear()).slice(2) + '</span></th>').join('') + '<th class="num">Promedio</th><th>Tendencia</th></tr></thead><tbody>';
  for (const [pk, r] of sorted) {
    const c = cat(pk), mx = Math.max(...r.v), open = ui.xopen.has(pk), hasSubs = Object.keys(r.subs).some(k => k !== '_self');
    h += '<tr class="xrow' + (open ? ' on' : '') + '"><td class="xl"><button class="xname" data-xopen="' + esc(pk) + '">' + (hasSubs ? '<span class="xchev">' + (open ? '▾' : '▸') + '</span>' : '<span class="xchev"></span>') + esc((c ? c.emoji + ' ' + c.name : 'Sin categoría')) + '</button></td>' +
      r.v.map((v, i) => cell(v, mx, pk, i)).join('') + '<td class="num xavg">' + short(avg(r.v)) + '</td><td>' + spark(r.v) + '</td></tr>';
    if (open) for (const [sk, sv] of Object.entries(r.subs).sort((a, b) => b[1].reduce((x, y) => x + y, 0) - a[1].reduce((x, y) => x + y, 0))) {
      const sc = sk === '_self' ? null : cat(sk), smx = Math.max(...sv);
      h += '<tr class="xsub"><td class="xl">' + esc(sc ? sc.name : 'Sin subcategoría') + '</td>' + sv.map((v, i) => cell(v, smx, pk + ':' + sk, i)).join('') + '<td class="num xavg">' + short(avg(sv)) + '</td><td>' + spark(sv) + '</td></tr>';
    }
  }
  h += '<tr class="xtot"><td class="xl">Total</td>' + tot.map(v => '<td class="num">' + (v ? short(v) : '·') + '</td>').join('') + '<td class="num">' + short(avg(tot)) + '</td><td>' + spark(tot) + '</td></tr></tbody></table></div>' +
    '<p class="note" style="padding:0">El promedio usa solo periodos cerrados con datos. Valores en miles (mil) y millones (M).</p></section>';
  XM = { ps, type };
  return h;
}
let XM = null;
function xCellSheet(key, i){
  const q = XM.ps[+i], [pk, sk] = key.split(':');
  const list = S.transactions.filter(t => t.type === XM.type && inP(t, q) && (() => { const c = cat(t.categoryId), pc = parentOf(c);
    if ((pc ? pc.id : '_') !== pk) return false; if (!sk) return true; return sk === '_self' ? !(c && c.parentId) : t.categoryId === sk; })()).sort((a, b) => b.amount - a.amount);
  const c = cat(sk && sk !== '_self' ? sk : pk);
  const title = (c ? c.name : 'Sin categoría') + ' · ' + pLabel(q);
  openSheet('<div class="sheet-h"><b id="sheet-title">' + esc(title) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">Total</span><div class="tile-v num">' + money(list.reduce((a, t) => a + t.amount, 0)) + '</div><span class="tile-s">' + list.length + ' movimientos</span></section>' +
    (list.length ? '<div>' + list.map(txRow).join('') + '</div>' : '<div class="empty">Sin movimientos.</div>') + '</div>');
}

/* ----- 2. explorador de movimientos ----- */
function xDefaults(){ return { from:iso(new Date(Date.now() - 90 * 864e5)), to:iso(new Date()), type:'', cat:'', acc:'', min:'', q:'', sort:'date', dir:-1, limit:150 }; }
function xExplorer(){
  const f = ui.xf = ui.xf || xDefaults();
  const cats = '<option value="">Todas las categorías</option>' + ['gasto','ingreso'].map(ty => S.categories.filter(c => !c.parentId && c.type === ty && !c.hidden).map(p0 =>
    '<option value="' + esc(p0.id) + '"' + (f.cat === p0.id ? ' selected' : '') + '>' + esc(p0.emoji + ' ' + p0.name) + '</option>' +
    S.categories.filter(c => c.parentId === p0.id && !c.hidden).map(s => '<option value="' + esc(s.id) + '"' + (f.cat === s.id ? ' selected' : '') + '>' + esc('    ' + p0.name + ' › ' + s.name) + '</option>').join('')).join('')).join('');
  return '<section class="card xwide"><div class="card-h"><h2>Explorador de movimientos</h2><div class="pills"><button class="pill" data-xreset>Limpiar filtros</button><button class="pill solid" data-xcsv>Descargar a Excel</button></div></div>' +
    '<div class="xfil">' +
    '<label>Desde<input type="date" class="inp" data-xf="from" value="' + esc(f.from) + '"></label>' +
    '<label>Hasta<input type="date" class="inp" data-xf="to" value="' + esc(f.to) + '"></label>' +
    '<label>Tipo<select class="inp" data-xf="type">' + [['','Todos'],['gasto','Gastos'],['ingreso','Ingresos'],['transferencia','Transferencias']].map(([k, l]) => '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' +
    '<label>Categoría<select class="inp" data-xf="cat">' + cats + '</select></label>' +
    '<label>Cuenta<select class="inp" data-xf="acc"><option value="">Todas las cuentas</option>' + S.accounts.filter(a => !a.hidden).map(a => '<option value="' + esc(a.id) + '"' + (f.acc === a.id ? ' selected' : '') + '>' + esc(accShort(a.id)) + '</option>').join('') + '</select></label>' +
    '<label>Monto mínimo<input class="inp num" inputmode="numeric" data-xf="min" value="' + (f.min ? nf.format(f.min) : '') + '" placeholder="0"></label>' +
    '<label class="xq">Buscar en la nota<input class="inp" data-xf="q" value="' + esc(f.q) + '" placeholder="Ej. almuerzo, Texaco, Angie" autocomplete="off"></label>' +
    '</div><div id="xtable">' + xTable() + '</div></section>';
}
function xFiltered(){
  const f = ui.xf, q = norm(f.q || '').trim(), min = +f.min || 0;
  const catOk = t => { if (!f.cat) return true; const c = cat(t.categoryId); return t.categoryId === f.cat || (c && c.parentId === f.cat); };
  let list = S.transactions.filter(t => t.type !== 'ajuste' && (!f.from || t.date >= f.from) && (!f.to || t.date <= f.to) && (!f.type || t.type === f.type) && catOk(t) &&
    (!f.acc || t.accountId === f.acc || t.toAccountId === f.acc) && t.amount >= min && (!q || norm(t.note || '').includes(q)));
  const key = { date:t => t.date + String(t.ts || 0).padStart(14, '0'), amount:t => t.amount, note:t => norm(t.note || ''), cat:t => { const c = cat(t.categoryId), pc = parentOf(c); return pc ? pc.name + (c.parentId ? c.name : '') : ''; }, acc:t => accShort(t.accountId) }[f.sort];
  list.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * f.dir; });
  return list;
}
function xTable(){
  const f = ui.xf, list = xFiltered();
  const g = list.filter(t => t.type === 'gasto').reduce((a, t) => a + t.amount, 0), i = list.filter(t => t.type === 'ingreso').reduce((a, t) => a + t.amount, 0);
  const th = (k, l, cls) => '<th class="' + (cls || '') + '"><button data-xsort="' + k + '">' + l + (f.sort === k ? (f.dir > 0 ? ' ↑' : ' ↓') : '') + '</button></th>';
  let h = '<div class="xsum"><span><b>' + nf.format(list.length) + '</b> movimientos</span><span>Gastos <b class="num">' + money(g) + '</b></span><span>Ingresos <b class="num">' + money(i) + '</b></span>' + (g && list.length ? '<span>Gasto promedio <b class="num">' + money(g / Math.max(1, list.filter(t => t.type === 'gasto').length)) + '</b></span>' : '') + '</div>';
  h += '<div class="xscroll xlistwrap"><table class="xt xlist"><thead><tr>' + th('date', 'Fecha') + th('note', 'Descripción', 'xl') + th('cat', 'Categoría') + th('acc', 'Cuenta') + th('amount', 'Valor', 'num') + '</tr></thead><tbody>';
  for (const t of list.slice(0, f.limit)) {
    const c = cat(t.categoryId), pc = parentOf(c), d = parseISO(t.date);
    const catTxt = t.type === 'transferencia' ? 'Transferencia → ' + accShort(t.toAccountId) : pc ? (pc.name + (c.parentId ? ' › ' + c.name : '')) : 'Sin categoría';
    h += '<tr class="xclick" data-tx="' + esc(t.id) + '"><td class="num">' + d.getDate() + ' ' + MES[d.getMonth()] + ' ' + String(d.getFullYear()).slice(2) + '</td><td class="xl">' + esc(t.note || '') + '</td><td>' + esc(catTxt) + '</td><td>' + esc(accShort(t.accountId)) + '</td>' +
      '<td class="num ' + (t.type === 'ingreso' ? 'pos' : t.type === 'transferencia' ? 'muted' : '') + '">' + (t.type === 'gasto' ? '−' : t.type === 'ingreso' ? '+' : '') + money(t.amount) + '</td></tr>';
  }
  h += '</tbody></table></div>';
  if (list.length > f.limit) h += '<button class="btn ghost block" data-xmore>Ver ' + Math.min(150, list.length - f.limit) + ' más (de ' + nf.format(list.length - f.limit) + ' restantes)</button>';
  if (!list.length) h += '<div class="empty">Ningún movimiento coincide con estos filtros.</div>';
  return h;
}
function xCsv(){
  const rows = [['Fecha','Tipo','Descripción','Categoría','Subcategoría','Cuenta','Cuenta destino','Valor']];
  for (const t of xFiltered()) { const c = cat(t.categoryId), pc = parentOf(c);
    rows.push([t.date, t.type, t.note || '', pc ? pc.name : '', c && c.parentId ? c.name : '', accShort(t.accountId), t.toAccountId ? accShort(t.toAccountId) : '', t.amount]); }
  const csv = '﻿' + rows.map(r => r.map(v => { const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8' })); a.download = 'caudal-movimientos-' + iso(new Date()) + '.csv'; a.click();
  toast('Archivo descargado: ábrelo con Excel');
}

/* ----- 3. evolución del patrimonio ----- */
function xWorth(){
  const N = 12, ps = []; for (let k = N - 1; k >= 0; k--) ps.push(period(ui.offset - k));
  const accs = S.accounts.filter(a => !a.hidden), today = iso(new Date());
  const ends = ps.map(q => q.e < today ? q.e : today);
  const bal = ends.map(() => ({}));
  const txs = S.transactions.slice().sort((a, b) => a.date.localeCompare(b.date));
  const run = {}; let j = 0;
  ends.forEach((e, k) => {
    while (j < txs.length && txs[j].date <= e) { const t = txs[j++]; const add = (id, v) => { if (id) run[id] = (run[id] || 0) + v; };
      if (t.type === 'ingreso' || t.type === 'ajuste') add(t.accountId, t.amount); else if (t.type === 'gasto') add(t.accountId, -t.amount); else if (t.type === 'transferencia') { add(t.accountId, -t.amount); add(t.toAccountId, t.amount); } }
    for (const a of accs) bal[k][a.id] = run[a.id] || 0;
  });
  const totals = bal.map(b => accs.reduce((s, a) => s + Math.max(0, b[a.id] || 0), 0));
  const first = totals.findIndex(v => v > 0); if (first < 0) return '';
  const order = accs.slice().sort((a, b) => (bal[N - 1][b.id] || 0) - (bal[N - 1][a.id] || 0));
  const top = order.slice(0, 6), rest = order.slice(6);
  const series = top.map((a, i) => ({ name:accShort(a.id), col:XCOL[i], v:bal.map(b => Math.max(0, b[a.id] || 0)) }));
  if (rest.length) series.push({ name:'Otras', col:XCOL[7], v:bal.map(b => rest.reduce((s, a) => s + Math.max(0, b[a.id] || 0), 0)) });
  const W = 760, H = 260, L = 56, R = 16, T = 16, B = 28, pw = W - L - R, ph = H - T - B, mx = Math.max(...totals) * 1.1, cw = pw / N, bw = cw * .6;
  const Y = v => T + ph - v / mx * ph;
  let g = ''; const step = niceStep(mx / 4);
  for (let v = 0; v <= mx; v += step) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="rgba(255,255,255,.06)"/><text x="' + (L - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + (v ? short(v) : '0') + '</text>';
  ps.forEach((q, k) => { let y = Y(0); const cx = L + cw * (k + .5);
    series.forEach(s => { const v = s.v[k]; if (!v) return; const h = Y(0) - Y(v); y -= h;
      g += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + Math.max(0, h - 1).toFixed(1) + '" fill="' + s.col + '" opacity=".85"><title>' + esc(s.name) + ': ' + money(v) + '</title></rect>'; });
    g += '<text x="' + cx.toFixed(1) + '" y="' + (Y(totals[k]) - 6).toFixed(1) + '" text-anchor="middle" style="font-size:10px;fill:var(--ink)">' + short(totals[k]) + '</text>';
    g += '<text x="' + cx.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + MES[q.end.getMonth()] + '</text>'; });
  const d12 = totals[N - 1] - totals[first], d1 = totals[N - 1] - totals[N - 2];
  const months = N - 1 - first;
  let h = '<section class="card xwide"><div class="card-h"><h2>Evolución de tu patrimonio</h2><span class="aside">saldo de tus cuentas al cierre de cada periodo</span></div>' +
    '<p class="insight">Hoy tienes <b>' + money(totals[N - 1]) + '</b> en total. ' + (months > 0 ? 'En ' + months + (months === 1 ? ' periodo' : ' periodos') + ' ' + (d12 >= 0 ? 'creció' : 'bajó') + ' <b class="' + (d12 >= 0 ? 'pos' : 'neg') + '">' + money(Math.abs(d12)) + '</b>' + (months > 1 ? ', unos ' + money(Math.abs(d12) / months) + ' por periodo en promedio' : '') + '. ' : '') +
    'Frente al periodo anterior: <b class="' + (d1 >= 0 ? 'pos' : 'neg') + '">' + (d1 >= 0 ? '+' : '−') + money(Math.abs(d1)) + '</b>.</p>' +
    '<div class="legend">' + series.map(s => '<span><i class="box" style="background:' + s.col + '"></i>' + esc(s.name) + '</span>').join('') + '</div>' +
    '<div class="chart"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Saldo total por cuenta al cierre de cada periodo">' + g + '</svg></div>';
  const cols = ps.slice(-6), off = N - 6;
  h += '<div class="xscroll"><table class="xt"><thead><tr><th class="xl">Cuenta</th>' + cols.map(q => '<th class="num">' + MES[q.end.getMonth()] + '</th>').join('') + '<th class="num">Cambio 6 meses</th></tr></thead><tbody>' +
    order.map(a => { const v = bal.slice(off).map(b => b[a.id] || 0), d = v[5] - v[0];
      return '<tr><td class="xl">' + esc(accShort(a.id)) + '</td>' + v.map(x => '<td class="num">' + money(x) + '</td>').join('') + '<td class="num ' + (d > 0 ? 'pos' : d < 0 ? 'neg' : '') + '">' + (d ? (d > 0 ? '+' : '−') + money(Math.abs(d)) : '·') + '</td></tr>'; }).join('') +
    '<tr class="xtot"><td class="xl">Total</td>' + totals.slice(off).map(x => '<td class="num">' + money(x) + '</td>').join('') + '<td class="num ' + (totals[N - 1] - totals[off] >= 0 ? 'pos' : 'neg') + '">' + money(totals[N - 1] - totals[off]) + '</td></tr></tbody></table></div></section>';
  return h;
}

/* ----- eventos ----- */
document.addEventListener('click', e => {
  const tr = e.target.closest('tr[data-tx]'); if (tr) { const t = S.transactions.find(x => x.id === tr.dataset.tx); if (t) txForm(t); return; }
  const b = e.target.closest('[data-xmtype],[data-xopen],[data-xcell],[data-xsort],[data-xmore],[data-xreset],[data-xcsv]'); if (!b) return;
  const d = b.dataset;
  if (d.xmtype) { ui.xmType = d.xmtype; return render(); }
  if (d.xopen) { ui.xopen.has(d.xopen) ? ui.xopen.delete(d.xopen) : ui.xopen.add(d.xopen); return render(); }
  if (d.xcell) { const [k, i] = d.xcell.split('|'); return xCellSheet(k, i); }
  if (d.xsort) { if (ui.xf.sort === d.xsort) ui.xf.dir *= -1; else { ui.xf.sort = d.xsort; ui.xf.dir = d.xsort === 'note' || d.xsort === 'cat' || d.xsort === 'acc' ? 1 : -1; } return xRedraw(); }
  if (d.xmore !== undefined) { ui.xf.limit += 150; return xRedraw(); }
  if (d.xreset !== undefined) { ui.xf = xDefaults(); return render(); }
  if (d.xcsv !== undefined) return xCsv();
});
function xRedraw(){ const el = $('#xtable'); if (el) el.innerHTML = xTable(); }
let xT = null;
const xUpd = el => { const k = el.dataset.xf; let v = el.value; if (k === 'min') { const n = parseInt(v.replace(/\D/g, ''), 10) || 0; v = n; if (el.value) el.value = n ? nf.format(n) : ''; } ui.xf[k] = v; ui.xf.limit = 150; };
document.addEventListener('input', e => { const el = e.target; if (!el.dataset || el.dataset.xf === undefined) return; xUpd(el); clearTimeout(xT); xT = setTimeout(xRedraw, 220); });
document.addEventListener('change', e => { const el = e.target; if (!el.dataset || el.dataset.xf === undefined) return; xUpd(el); xRedraw(); });
