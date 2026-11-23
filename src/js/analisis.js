/* Análisis: gráficas de ritmo, categorías, presupuestos, calendario y periodos. */
/* ----- ritmo: acumulado o diario -----
   Con los colores de siempre y su leyenda: lo que llevas en verde, el ritmo ideal en gris punteado, el tope
   (presupuesto o, sin plan, lo que entró) en rosa y la proyección en rosa si te pasas o en verde si alcanza. */
function ritmoTope(p){
  const B = paceBudget(p), bud = B > 0 && !!planFor(p);
  if (B > 0) return { B, bud, nombre:'Presupuesto', de:'tu presupuesto' };
  const inc = totals(p).inc; if (inc > 0) return { B:inc, bud:false, nombre:'Lo que entró', de:'lo que entró' };
  return { B:0, bud:false, nombre:'', de:'' };
}
const lgLinea = (color, tipo, txt) => '<span><svg width="22" height="8" aria-hidden="true"><line x1="1" x2="21" y1="4" y2="4" stroke="' + color + '" stroke-width="' + (tipo === 'grueso' ? 3 : 1.8) + '" stroke-linecap="round"' + (tipo === 'dash' ? ' stroke-dasharray="3 4"' : tipo === 'dot' ? ' stroke-dasharray="1.5 3.5"' : '') + '/></svg>' + txt + '</span>';
function chartRitmo(p){
  const N = daysIn(p), ti = todayIdx(p), mode = ui.ritmo || 'acum', showPrev = !!ui.ritPrev;
  const head = '<div class="card-h"><h2>Ritmo del gasto</h2><div class="pills">' + [['acum','Acumulado'],['dia','Día a día']].map(([k, l]) => '<button class="pill" data-rit="' + k + '" aria-pressed="' + (mode === k) + '">' + l + '</button>').join('') + '</div></div>';
  if (ti < 0) return '<section class="card">' + head + '<div class="empty">Este periodo aún no empieza.</div></section>';
  const TP = ritmoTope(p), B = TP.B, bud = TP.bud, dc = dailyExp(p, bud ? 'var' : false), pp = period(ui.offset - 1), dp = dailyExp(pp, bud ? 'var' : false);
  const isCur = iso(new Date()) <= p.e;
  const cumc = cum(dc), spent = cumc[ti], ideal = B * (ti + 1) / N, diff = spent - ideal;
  const daysLeft = N - ti - 1;
  const proj = !isCur ? spent : spent + (spent / (ti + 1)) * daysLeft, pasa = B > 0 && proj > B;
  const colProj = pasa ? PAL.rosa : PAL.verde;
  /* veredicto en palabras: lo primero que se lee */
  let verdict = '';
  if (B > 0) {
    const malo = diff > B * 0.02;
    verdict = '<div class="rit-v"><b class="' + (malo ? 'neg' : 'pos') + '">' + (Math.abs(diff) < B * 0.01 ? 'Vas justo al ritmo' : malo ? 'Vas gastando más rápido de lo que alcanza' : 'Vas bien: gastas más lento de lo que alcanza') + '</b>' +
      '<span>' + (isCur ? 'A hoy lo ideal era llevar ' + money(ideal) + ' y llevas <b>' + money(spent) + '</b>' + (Math.abs(diff) >= B * 0.01 ? ' (' + money(Math.abs(diff)) + (diff > 0 ? ' de más' : ' de menos') + ')' : '') + '.' : 'Cerraste con ' + money(spent) + ' de ' + money(B) + '.') +
      (isCur ? ' A este paso cerrarías en <b class="' + (pasa ? 'neg' : 'pos') + '">' + money(proj) + '</b>' + (pasa ? ', ' + money(proj - B) + ' más que ' + TP.de + '.' : ', ' + money(B - proj) + ' menos que ' + TP.de + '.') : '') + '</span></div>';
  } else verdict = '<div class="rit-v"><b>Llevas ' + money(spent) + ' gastados</b><span>Cuando registres ingresos o armes tu Plan, aquí verás si el gasto va más rápido de lo que alcanza.</span></div>';
  const W = 340, H = 210, L = 40, R = 12, T = 18, Bm = 24, pw = W - L - R, ph = H - T - Bm;
  const X = i => L + (N <= 1 ? 0 : i * pw / (N - 1)), xb = i => L + (i + .5) * pw / N;
  let g = '<defs><linearGradient id="gLleva" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + PAL.verde + '" stop-opacity=".16"/><stop offset="1" stop-color="' + PAL.verde + '" stop-opacity="0"/></linearGradient></defs>', maxY, Y;
  const ticks = N > 20 ? [0, 7, 14, 21, N - 1] : [0, Math.floor((N - 1) / 2), N - 1];
  const axis = (fx) => { let s = ''; const step = niceStep(maxY / 4);
    for (let v = 0; v <= maxY; v += step) s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + PAL.velo(.06) + '"/><text x="' + (L - 8) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + (v ? short(v) : '0') + '</text>';
    ticks.forEach((i, k) => { const d = new Date(p.start); d.setDate(d.getDate() + i);
      s += '<text x="' + fx(i).toFixed(1) + '" y="' + (H - 5) + '" text-anchor="' + (k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle') + '">' + d.getDate() + ' ' + MES[d.getMonth()] + '</text>'; });
    return s; };
  let cur, prev = [], legend = [];
  if (mode === 'acum') {
    cur = cumc.slice(0, ti + 1); if (showPrev) prev = cum(dp).slice(0, N);
    maxY = Math.max(1, ...cur, B, proj, ...(prev.length ? [prev[prev.length - 1]] : [])) * 1.08;
    Y = v => T + ph - v / maxY * ph;
    g += axis(X);
    if (B > 0) {
      g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(B).toFixed(1) + '" y2="' + Y(B).toFixed(1) + '" stroke="' + PAL.rosa + '" stroke-opacity=".7" stroke-width="1.4"/>' +
        '<text x="' + (L + 4) + '" y="' + (Y(B) - 5).toFixed(1) + '" style="fill:' + PAL.rosa + ';font-size:10px">' + TP.nombre + ' ' + short(B) + '</text>';
      g += '<path d="M' + X(0) + ',' + Y(0) + ' L' + X(N - 1) + ',' + Y(B).toFixed(1) + '" stroke="' + PAL.gris + '" stroke-opacity=".8" stroke-width="1.4" stroke-dasharray="3 4" fill="none"/>';
      legend.push(lgLinea(PAL.verde, 'grueso', 'Lo que llevas'), lgLinea(PAL.gris, 'dash', 'Ritmo ideal'), lgLinea(PAL.rosa, '', TP.nombre));
      if (isCur && daysLeft > 0) legend.push(lgLinea(colProj, 'dot', 'A este paso'));
    } else legend.push(lgLinea(PAL.verde, 'grueso', 'Lo que llevas'));
    if (prev.length) { g += '<path d="' + mono(prev.map((v, i) => [X(i), Y(v)])) + '" stroke="' + PAL.velo(.3) + '" stroke-width="1.5" fill="none"/>'; legend.push(lgLinea(PAL.velo(.35), '', 'Mes pasado')); }
    const cp = mono(cur.map((v, i) => [X(i), Y(v)]));
    g += '<path d="' + cp + ' L' + X(cur.length - 1).toFixed(1) + ',' + Y(0) + ' L' + X(0) + ',' + Y(0) + ' Z" fill="url(#gLleva)"/>';
    g += '<path d="' + cp + '" stroke="' + PAL.verde + '" stroke-width="5" fill="none" opacity=".55" /><path d="' + cp + '" stroke="' + PAL.verde + '" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
    const ex = X(ti), ey = Y(spent);
    if (B > 0 && isCur && daysLeft > 0) {
      g += '<path d="M' + ex.toFixed(1) + ',' + ey.toFixed(1) + ' L' + X(N - 1).toFixed(1) + ',' + Y(proj).toFixed(1) + '" stroke="' + colProj + '" stroke-width="1.8" stroke-dasharray="1.5 3.5" stroke-linecap="round" fill="none"/>' +
        '<circle cx="' + X(N - 1).toFixed(1) + '" cy="' + Y(proj).toFixed(1) + '" r="3.2" fill="' + colProj + '"/>' +
        '<text x="' + (X(N - 1) - 4).toFixed(1) + '" y="' + (Y(proj) + (pasa ? -8 : 14)).toFixed(1) + '" text-anchor="end" style="font-size:9.5px;fill:' + colProj + '">a este paso ' + short(proj) + '</text>'; }
    g += '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="7" fill="' + PAL.verde + '" opacity=".25"/><circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="4" fill="' + PAL.verde + '"/>' +
      '<text x="' + (ex - 8).toFixed(1) + '" y="' + (ey - 10).toFixed(1) + '" text-anchor="end" style="fill:' + PAL.tinta + ';font-size:10.5px;font-weight:600">' + (isCur ? 'Hoy ' : '') + short(spent) + '</text>';
  } else {
    /* día a día: lo gastado cada día, en barras; la línea punteada es lo que alcanza por día */
    cur = dc.slice(0, ti + 1); if (showPrev) prev = dp.slice(0, N);
    const porDia = B > 0 ? B / N : 0, avg = cur.reduce((a, v) => a + v, 0) / (ti + 1);
    maxY = Math.max(1, ...cur, ...prev, porDia) * 1.1; Y = v => T + ph - v / maxY * ph;
    g += axis(xb);
    const bw = Math.max(3, pw / N - 3);
    cur.forEach((v, i) => { if (!v) return; const sobre = porDia && v > porDia;
      g += '<rect x="' + (xb(i) - bw / 2).toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + (Y(0) - Y(v)).toFixed(1) + '" rx="' + Math.min(4, bw / 2).toFixed(1) + '" fill="' + (sobre ? PAL.rosa : PAL.verde) + '" opacity="' + (i === ti ? .95 : .7) + '"/>'; });
    if (porDia) g += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(porDia).toFixed(1) + '" y2="' + Y(porDia).toFixed(1) + '" stroke="' + PAL.gris + '" stroke-width="1.4" stroke-dasharray="3 4"/><text x="' + (W - R) + '" y="' + (Y(porDia) - 5).toFixed(1) + '" text-anchor="end" style="font-size:9.5px">alcanza ' + short(porDia) + ' por día</text>';
    if (prev.length) g += '<path d="' + mono(prev.map((v, i) => [xb(i), Y(v)])) + '" stroke="' + PAL.velo(.3) + '" stroke-width="1.3" fill="none"/>';
    legend.push('<span><i class="box" style="background:' + PAL.verde + ';opacity:.75"></i>Lo que gastaste ese día</span>');
    if (porDia) legend.push('<span><i class="box" style="background:' + PAL.rosa + '"></i>Más de lo que alcanza</span>', lgLinea(PAL.gris, 'dash', 'Lo que alcanza por día'));
    if (prev.length) legend.push(lgLinea(PAL.velo(.35), '', 'Mes pasado'));
  }
  g += '<g id="xh" style="display:none"><line y1="' + T + '" y2="' + (T + ph) + '" stroke="' + PAL.tinta + '" stroke-opacity=".3" stroke-dasharray="3 4"/><circle r="5.5" fill="' + PAL.verde + '" stroke="' + PAL.superficie + '" stroke-width="2" class="d1"/><circle r="3.5" fill="' + PAL.gris + '" stroke="' + PAL.superficie + '" stroke-width="2" class="d2"/></g>';
  g += '<rect x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
  CH.ritmo = { N, cur, prev, B, ref:mode === 'acum' ? B : B / N, mode, X:mode === 'acum' ? X : xb, Y, W, L, pw, p };
  const avg = cur.reduce((a, v) => a + v, 0) / (ti + 1);
  const foot = mode === 'dia'
    ? '<p class="insight">Gastas en promedio <b>' + money(avg) + ' por día</b>' + (B > 0 ? ' y te alcanza para ' + money(B / N) + '. Las barras de «Más de lo que alcanza» son días en que gastaste más de eso.' : '.') + ' Toca una barra para ver el valor.</p>'
    : B > 0 ? '<p class="insight">' + (bud ? 'Cuenta el gasto de los rubros variables de tu plan. ' : 'Como no tienes Plan, se compara con lo que entró en el periodo. ') + 'Si <b>lo que llevas</b> va por encima del <b>ritmo ideal</b>, estás gastando más rápido de lo que alcanza. Toca la gráfica para ver cada día.</p>' : '';
  return '<section class="card">' + head + verdict + '<div class="legend">' + legend.join('') + '</div>' +
    '<div class="chart" data-kind="ritmo"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Ritmo del gasto del periodo">' + g + '</svg></div>' + foot +
    '<button class="pill" data-ritprev aria-pressed="' + showPrev + '" style="align-self:flex-start">' + (showPrev ? 'Ocultar mes pasado' : 'Comparar con el mes pasado') + '</button></section>';
}

/* ----- mapa de categorías ----- */
function squarify(items, rect){
  const total = items.reduce((a, b) => a + b.v, 0) || 1, scale = rect.w * rect.h / total;
  const nodes = items.map(it => ({ ...it, a: it.v * scale })), out = []; let row = [], r = { ...rect };
  const worst = (rw, s) => { if (!rw.length) return Infinity; const sum = rw.reduce((a, n) => a + n.a, 0), mx = Math.max(...rw.map(n => n.a)), mn = Math.min(...rw.map(n => n.a)); return Math.max(s * s * mx / (sum * sum), (sum * sum) / (s * s * mn)); };
  const place = rw => { const sum = rw.reduce((a, n) => a + n.a, 0);
    if (r.w >= r.h) { const cw = sum / r.h; let yy = r.y; rw.forEach(n => { const hh = n.a / cw; out.push({ ...n, x:r.x, y:yy, w:cw, h:hh }); yy += hh; }); r.x += cw; r.w -= cw; }
    else { const rh = sum / r.w; let xx = r.x; rw.forEach(n => { const ww = n.a / rh; out.push({ ...n, x:xx, y:r.y, w:ww, h:rh }); xx += ww; }); r.y += rh; r.h -= rh; } };
  while (nodes.length) { const n = nodes[0], s = Math.min(r.w, r.h);
    if (!row.length || worst(row.concat(n), s) <= worst(row, s)) { row.push(n); nodes.shift(); } else { place(row); row = []; } }
  if (row.length) place(row);
  return out;
}
function chartCategorias(p){
  const m = spentByParent(p, 'gasto'), pm = spentByParent(period(ui.offset - 1), 'gasto');
  const rows = Object.entries(m).sort((a, b) => b[1].total - a[1].total);
  const total = rows.reduce((a, r) => a + r[1].total, 0);
  let out = '<section class="card"><div class="card-h"><h2>En qué se va</h2><span class="aside num">' + money(total) + '</span></div>';
  if (!rows.length) return out + '<div class="empty">Sin gastos en este periodo.</div></section>';
  const items = rows.slice(0, 7).map(([id, x]) => { const c = cat(id); return { id, v:x.total, name:c ? c.name : 'Sin categoría', emoji:c ? c.emoji : '' }; });
  const rest = rows.slice(7).reduce((a, r) => a + r[1].total, 0);
  if (rest > 0) items.push({ id:'_rest', v:rest, name:'Otras ' + (rows.length - 7), emoji:'' });
  const W = 340, H = 210, max = Math.max(...items.map(i => i.v));
  const cells = squarify(items, { x:0, y:0, w:W, h:H });
  CH.tree = cells.map(c => ({ title:(c.emoji ? c.emoji + ' ' : '') + c.name, rows:[[PAL.verde, 'Gasto', money(c.v)], [PAL.gris, 'Del total', Math.round(c.v / total * 100) + '%']] }));
  let g = '';
  cells.forEach((c, i) => {
    const k = c.v / max, w = Math.max(0, c.w - 4), h = Math.max(0, c.h - 4), x = c.x + 2, y = c.y + 2;
    g += '<g data-i="' + i + '" data-cid="' + esc(c.id) + '" style="cursor:pointer"><rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="12" fill="' + PAL.verde + '" fill-opacity="' + (.10 + .40 * k).toFixed(2) + '" stroke="' + PAL.velo((.06 + .14 * k).toFixed(2)) + '"/>';
    const pct = Math.round(c.v / total * 100) + '%';
    if (w > 74 && h > 48) { const maxc = Math.floor((w - 22) / 6.4); let nm = c.name; if (nm.length > maxc) nm = nm.slice(0, Math.max(3, maxc - 1)) + '…';
      g += '<text x="' + (x + 12).toFixed(1) + '" y="' + (y + 22).toFixed(1) + '" style="fill:' + PAL.tinta + ';font-size:12px;font-weight:500;opacity:.85">' + esc(nm) + '</text><text x="' + (x + 12).toFixed(1) + '" y="' + (y + 42).toFixed(1) + '" style="fill:' + PAL.tinta + ';font-size:17px;font-weight:600">' + pct + '</text>';
    } else if (w > 30 && h > 22) g += '<text x="' + (x + w / 2).toFixed(1) + '" y="' + (y + h / 2 + 4).toFixed(1) + '" text-anchor="middle" style="fill:' + PAL.tinta + ';font-size:10.5px;font-weight:600">' + pct + '</text>';
    g += '</g>';
  });
  out += '<div class="chart" data-kind="tree"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Proporción del gasto por categoría">' + g + '</svg></div><div>';
  for (const [id, x] of rows) {
    const c = cat(id), open = ui.open.has(id), pv = pm[id] ? pm[id].total : 0;
    let dl; if (!pv) dl = '<span class="delta muted">Nuevo</span>';
    else { const d = (x.total - pv) / pv; dl = Math.abs(d) < .05 ? '<span class="delta muted">≈ igual</span>' : '<span class="delta ' + (d > 0 ? 'neg' : 'pos') + '">' + (d > 0 ? '↑ ' : '↓ ') + Math.round(Math.abs(d) * 100) + '%</span>'; }
    out += '<button class="catrow" data-open="' + esc(id) + '" aria-expanded="' + open + '"><div class="catline"><span class="em">' + esc(c ? c.emoji : '•') + '</span><span class="nm">' + esc(c ? c.name : 'Sin categoría') + '</span>' + dl + '<span class="am num">' + money(x.total) + '</span></div>';
    if (open) out += '<div class="subs">' + Object.entries(x.subs).sort((a, b) => b[1] - a[1]).map(([sid, v]) => '<div><span>' + esc(sid === '_self' ? 'Sin subcategoría' : (((cat(sid) || {}).emoji || '') + ' ' + ((cat(sid) || {}).name || ''))) + '</span><span class="num">' + money(v) + '</span></div>').join('') + '</div>';
    out += '</button>';
  }
  return out + '</div><p class="insight">Toca un recuadro del mapa para explorar esa categoría. La flecha compara con el periodo anterior.</p></section>';
}

/* ----- presupuestos con ritmo ----- */
function chartPresupuestos(p){
  const pl = planFor(p);
  let buds = Object.entries(S.budgets || {}).filter(([id]) => { const c = cat(id); return c && c.type === 'gasto' && !c.parentId; });
  let PR = null;
  if (pl) { PR = planReal(pl, p); buds = pl.items.filter(isGastoItem).map(i => [i.id, itemBudget(pl, i, p)]); }
  if (!buds.length) return '<section class="card"><div class="card-h"><h2>Presupuestos</h2><button class="pill" data-go="ajustes" data-sec="presupuesto">Definir</button></div><div class="empty">Aún no tienes presupuestos por categoría.</div></section>';
  const m = spentByParent(p, 'gasto'), N = daysIn(p), ti = todayIdx(p);
  const today = iso(new Date()), isCurrent = today >= p.s && today <= p.e, el = isCurrent ? (ti + 1) / N : 1;
  const list = buds.map(([id, b]) => ({ id, b, s:PR ? PR.r[id] : (m[id] && m[id].total) || 0 })).sort((a, c) => c.s / c.b - a.s / a.b);
  let out = '<section class="card"><div class="card-h"><h2>Presupuestos</h2><button class="pill" data-go="' + (pl ? 'plan' : 'ajustes') + '">Editar</button></div>';
  out += '<div class="legend"><span><i class="box" style="background:var(--brand)"></i>Gastado</span><span><i style="width:2px;height:12px;border:0;background:var(--ink)"></i>Límite</span>' + (isCurrent ? '<span><span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--muted)"></span>Dónde deberías ir hoy</span>' : '') + '</div><div>';
  for (const { id, b, s } of list) {
    let c = cat(id); if (pl) { const it = pl.items.find(i => i.id === id), c0 = cat(it.cats[0]); c = { name:it.name, emoji:(c0 && c0.emoji) || '•' }; }
    const mx = Math.max(b, s) * 1.04, ideal = b * el;
    let cls = '', msg;
    if (s > b) { cls = 'neg'; msg = 'Te pasaste ' + money(s - b); }
    else if (s === b) { cls = 'warn'; msg = 'Llegaste al límite'; }
    else if (isCurrent && s > ideal * 1.1 && s > 0) { cls = 'warn'; msg = 'Vas rápido · quedan ' + money(b - s); }
    else msg = 'Quedan ' + money(b - s);
    out += '<div class="bullet"><div class="catline"><span class="em">' + esc(c.emoji) + '</span><span class="nm">' + esc(c.name) + '</span><span class="am num ' + cls + '">' + msg + '</span></div>' +
      '<div class="btrack"><div class="fill ' + cls + '" style="width:' + (s / mx * 100).toFixed(1) + '%"></div><div class="cap" style="left:calc(' + (b / mx * 100).toFixed(1) + '% - 1px)"></div>' + (isCurrent ? '<div class="pace" style="left:' + (ideal / mx * 100).toFixed(1) + '%"></div>' : '') + '</div>' +
      '<div class="meta num"><span>' + money(s) + ' de ' + money(b) + '</span>' + (isCurrent ? '<span>Hoy: ' + money(ideal) + '</span>' : '') + '</div></div>';
  }
  return out + '</div></section>';
}

/* ----- calendario de calor ----- */
function chartCalendario(p){
  const N = daysIn(p), ti = todayIdx(p), daily = dailyExp(p);
  const max = Math.max(1, ...daily.slice(0, Math.max(0, ti + 1)));
  const off = (p.start.getDay() + 6) % 7, todayS = iso(new Date());
  CH.cal = [];
  let cells = ['L','M','M','J','V','S','D'].map(d => '<div class="wd">' + d + '</div>').join('');
  for (let k = 0; k < off; k++) cells += '<div class="c out"></div>';
  for (let i = 0; i < N; i++) {
    const d = new Date(p.start); d.setDate(d.getDate() + i); const v = daily[i];
    if (i > ti) { cells += '<div class="c fut">' + d.getDate() + '</div>'; continue; }
    const pc = v ? Math.round(20 + 80 * (v / max)) : 0;
    CH.cal.push({ title:longDate(d), rows:[[PAL.verde, 'Gastaste', money(v)], [PAL.gris, 'Movimientos', String(daily.counts[i])]] });
    cells += '<div class="c' + (pc > 50 ? ' hi' : '') + (iso(d) === todayS ? ' today' : '') + '" data-i="' + (CH.cal.length - 1) + '" data-day="' + iso(d) + '" role="button" tabindex="0" style="' + (v ? 'background:color-mix(in srgb,var(--brand) ' + pc + '%,var(--surface-2))' : '') + '">' + d.getDate() + '</div>';
  }
  const wsum = new Array(7).fill(0), wcnt = new Array(7).fill(0);
  for (let o = 0; o < 3; o++) { const q = period(ui.offset - o), qi = todayIdx(q); if (qi < 0) continue; const dq = dailyExp(q);
    for (let i = 0; i <= qi; i++) { const d = new Date(q.start); d.setDate(d.getDate() + i); wsum[d.getDay()] += dq[i]; wcnt[d.getDay()]++; } }
  const avg = wsum.map((s, i) => wcnt[i] ? s / wcnt[i] : 0), top = avg.indexOf(Math.max(...avg));
  const zero = daily.slice(0, ti + 1).filter(v => !v).length;
  let ins = avg[top] > 0 ? 'Gastas más los <b>' + DIAL[top].toLowerCase().replace(/([^s])$/, '$1s') + '</b>: ' + money(avg[top]) + ' en promedio ese día.' : '';
  if (ti >= 0) ins += ' Llevas <b>' + zero + (zero === 1 ? ' día' : ' días') + ' sin gastos</b> en este periodo.';
  return '<section class="card"><div class="card-h"><h2>Cuándo gastas</h2><span class="aside">toca un día para ver el detalle</span></div>' + (ins ? '<p class="insight">' + ins + '</p>' : '') +
    '<div class="chart cal" data-kind="cal">' + cells + '</div>' +
    '<div class="scale"><span>Menos</span>' + [0, 30, 55, 80, 100].map(x => '<i style="background:' + (x ? 'color-mix(in srgb,var(--brand) ' + x + '%,var(--surface-2))' : PAL.velo(.04)) + '"></i>').join('') + '<span>Más</span></div></section>';
}

/* ----- entra y sale, seis periodos ----- */
function chartPeriodos(){
  const data = [];
  for (let i = 5; i >= 0; i--) { const q = period(ui.offset - i), t = totals(q); data.push({ q, inc:t.inc, exp:t.exp, net:t.inc - t.exp, l:MES[q.end.getMonth()], cur:i === 0 }); }
  const isLive = iso(new Date()) <= data[5].q.e;
  const W = 340, H = 214, L = 8, R = 8, T = 26, Bm = 40, pw = W - L - R, ph = H - T - Bm;
  const hi = Math.max(1, ...data.map(d => d.net)), lo = Math.min(0, ...data.map(d => d.net)), span = (hi - lo) * 1.15 || 1;
  const Y = v => T + (hi * 1.08 - v) / span * ph, y0 = Y(0), cw = pw / data.length, bw = Math.min(34, cw * .56);
  let g = '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y0.toFixed(1) + '" y2="' + y0.toFixed(1) + '" stroke="' + PAL.velo(.18) + '"/>';
  CH.cols = [];
  data.forEach((d, i) => {
    const cx = L + cw * (i + .5), pos = d.net >= 0, top = Math.min(Y(d.net), y0), h = Math.max(2, Math.abs(Y(d.net) - y0));
    const col = pos ? PAL.verde : PAL.rosa, rate = d.inc ? Math.round(d.net / d.inc * 100) : null;
    g += '<rect x="' + (cx - bw / 2).toFixed(1) + '" y="' + top.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="8" fill="' + col + '" fill-opacity="' + (d.cur && isLive ? .45 : .85) + '"' + (d.cur && isLive ? ' stroke="' + col + '" stroke-dasharray="3 3"' : '') + '/>';
    g += '<text x="' + cx.toFixed(1) + '" y="' + (pos ? top - 7 : top + h + 13).toFixed(1) + '" text-anchor="middle" style="fill:' + col + ';font-size:10.5px;font-weight:600">' + (pos ? '+' : '−') + short(Math.abs(d.net)) + '</text>';
    g += '<text x="' + cx.toFixed(1) + '" y="' + (H - 21) + '" text-anchor="middle" style="' + (d.cur ? 'fill:var(--ink);font-weight:600;' : '') + 'font-size:11px">' + d.l + (d.cur && isLive ? '*' : '') + '</text>';
    g += '<text x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" style="font-size:9.5px;fill:var(--faint)">' + (rate !== null ? rate + '%' : '') + '</text>';
    g += '<rect data-i="' + i + '" x="' + (L + cw * i).toFixed(1) + '" y="0" width="' + cw.toFixed(1) + '" height="' + H + '" fill="transparent" style="cursor:pointer"/>';
    CH.cols.push({ title:pLabel(d.q) + (d.cur && isLive ? ' (en curso)' : ''), rows:[['var(--in)', 'Entró', money(d.inc)], [PAL.verde, 'Salió', money(d.exp)], [col, pos ? 'Te quedó' : 'Faltó', money(Math.abs(d.net))]] });
  });
  const closed = data.filter(d => !(d.cur && isLive) && d.inc > 0);
  const avgNet = closed.length ? closed.reduce((a, d) => a + d.net, 0) / closed.length : 0;
  const avgRate = closed.length ? Math.round(closed.reduce((a, d) => a + d.net / d.inc, 0) / closed.length * 100) : null;
  const neg = closed.filter(d => d.net < 0), cur = data[5];
  let ins = avgRate !== null ? 'En promedio te quedan <b>' + money(avgNet) + ' al mes</b>, el ' + avgRate + '% de lo que entra.' : '';
  if (neg.length) ins += ' En <b>' + neg.map(d => MESL[d.q.end.getMonth()]).join(' y ') + '</b> gastaste más de lo que entró.';
  if (isLive && cur.inc) ins += ' Este periodo, a falta de ' + (daysIn(cur.q) - todayIdx(cur.q) - 1) + ' días, vas en <b>' + money(cur.net, true) + '</b>.';
  return '<section class="card glow"><div class="card-h"><h2>Cuánto te queda cada mes</h2><span class="aside">últimos 6 periodos</span></div>' + (ins ? '<p class="insight">' + ins + '</p>' : '') +
    '<div class="chart" data-kind="cols"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Lo que queda cada periodo: ingresos menos gastos">' + g + '</svg></div>' +
    '<div class="legend"><span><i class="box" style="background:' + PAL.verde + '"></i>Te sobró</span><span><i class="box" style="background:' + PAL.rosa + '"></i>Gastaste más de lo que entró</span></div>' +
    '<p class="note" style="padding:0">Cada barra es lo que entró menos lo que gastaste. Debajo del mes, el porcentaje de lo que entró que te quedó.' + (isLive ? ' * Periodo en curso.' : '') + ' Toca una barra para ver el detalle.</p></section>';
}

/* cómo vas este periodo, en una frase y una barra: cuánto de lo que entró ya se gastó */
function flowCard(p){
  const { inc, exp } = totals(p), rate = inc ? Math.round((inc - exp) / inc * 100) : null, pct = inc ? Math.round(exp / inc * 100) : null;
  const saleW = inc ? Math.min(100, exp / inc * 100) : (exp ? 100 : 0), isCur = iso(new Date()) <= p.e;
  const frase = !inc ? (exp ? 'Este periodo no has registrado ingresos: llevas <b>' + money(exp) + '</b> gastados.' : 'Aún no hay movimientos en este periodo.')
    : exp > inc ? '<b class="neg">Gastaste ' + money(exp - inc) + ' más de lo que entró.</b> Ese faltante salió de lo que ya tenías.'
    : (isCur ? 'Llevas gastado ' : 'Gastaste ') + 'el <b>' + pct + '%</b> de lo que entró. ' + (isCur ? 'Te quedan ' : 'Te quedaron ') + '<b class="pos">' + money(inc - exp) + '</b>.';
  return '<section class="card"><div class="card-h"><h2>Cómo vas</h2><span class="aside">' + (rate !== null ? 'Te queda el ' + Math.max(0, rate) + '%' : '') + '</span></div>' +
    '<p class="insight" style="margin:0 0 10px">' + frase + '</p>' +
    '<div class="flowbar" aria-hidden="true"><i style="width:' + saleW.toFixed(1) + '%;min-width:' + (saleW > 0 ? 6 : 0) + 'px;background:var(--out)"></i><i style="flex:1;background:var(--in);box-shadow:0 0 12px -1px var(--in)"></i></div>' +
    '<div class="stats3"><div><span><i style="background:var(--in)"></i>Entró</span><b class="num">' + money(inc) + '</b></div><div><span><i style="background:var(--out)"></i>Gastaste</span><b class="num">' + money(exp) + '</b></div><div><span><i style="background:var(--in)"></i>Te queda</span><b class="num' + (inc - exp < 0 ? ' neg' : '') + '">' + money(inc - exp) + '</b></div></div>' +
    '<p class="note" style="padding:0;margin:8px 0 0">Lo que pasas a tus ahorros no es gasto: sigue contando como lo que te queda.</p></section>';
}
function vAnalisis(p){
  const { exp } = totals(p);
  return '<div class="hello"><h1>Análisis</h1><p>' + money(exp) + ' gastados del ' + fmtShort(p.start) + ' al ' + fmtShort(p.end) + '</p></div>' +
    flowCard(p) + chartRitmo(p) + chartCategorias(p) + (planFor(p) ? '' : chartPresupuestos(p)) + chartCalendario(p) + chartPeriodos();
}
