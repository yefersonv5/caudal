/* ---------- plan del mes: el presupuesto como fuente única ---------- */
const CLS = [['Ahorro', '#4d93e0'], ['Esenciales', '#b8709f'], ['No esenciales', '#E6B3D6']];
const clsColor = c => (CLS.find(x => x[0] === c) || [0, '#8d858c'])[1];
const ACC_COLORS = ['#b8709f', '#4d93e0', '#E6B3D6', '#7fb8a4', '#F2B866', '#9a8fd6', '#d98a7a', '#8d858c'];
const isGastoItem = i => (i.cats || []).length > 0;
/* pago fijo: se paga de una vez (cadenas, recibos), no se reparte día a día en el mes */
const billCats = () => new Set((S.bills || []).filter(b => b.active !== false).map(b => b.categoryId));
const isFijo = i => isGastoItem(i) && (i.fijo === true || (i.fijo !== false && ((i.every || 1) > 1 || (i.cats || []).some(c => billCats().has(c)))));
function varBudget(pl, p){ return pl.items.filter(i => isGastoItem(i) && !isFijo(i)).reduce((a, i) => a + itemBudget(pl, i, p), 0); }
function fijoState(s, b){ return s >= b * 0.95 && s > 0 ? ['pos', 'Pagado ✓'] : s > 0 ? ['', 'Faltan ' + money(b - s)] : ['', 'Por pagar ' + money(b)]; }
S.plans = S.plans || [];

function planFor(p){
  const ps = (S.plans || []).filter(x => x.start <= p.e).sort((a, b) => b.start.localeCompare(a.start));
  return ps[0] || null;
}
function itemOfCat(pl, catId){
  if (!pl || !catId) return null;
  const exact = pl.items.find(i => (i.cats || []).includes(catId)); if (exact) return exact;
  const c = cat(catId); if (!c || !c.parentId) return null;
  return pl.items.find(i => (i.cats || []).includes(c.parentId)) || null;
}
function planGastoTotal(pl){ return pl.items.filter(isGastoItem).reduce((a, i) => a + i.amount, 0); }
/* rubros que se pagan cada N meses (ej. agua bimensual): se aparta cada mes y el tope del periodo
   suma lo apartado y no usado en los N-1 periodos anteriores */
const prevPeriod = p => periodFor(iso(new Date(parseISO(p.s).getTime() - 864e5)));
function itemSpentIn(pl, i, p){
  let s = 0;
  for (const t of S.transactions) if (inP(t, p)) {
    if (isGastoItem(i)) { if (t.type === 'gasto' && itemOfCat(pl, t.categoryId) === i) s += t.amount; }
    else if (t.type === 'transferencia' && t.toAccountId === i.acc && t.accountId !== i.acc) s += t.amount;
  }
  return s;
}
function itemBudget(pl, i, p){
  const n = Math.max(1, Math.min(12, i.every || 1)); let b = i.amount || 0;
  if (n === 1) return b;
  let q = p;
  for (let k = 1; k < n; k++) { q = prevPeriod(q); if (q.e < pl.start) break; const s = itemSpentIn(pl, i, q); if (s >= (i.amount || 0) * 0.5 && s > 0) break; b += Math.max(0, (i.amount || 0) - s); }
  return b;
}
const everyTxt = n => n === 2 ? 'cada 2 meses' : n === 3 ? 'cada 3 meses' : n > 1 ? 'cada ' + n + ' meses' : 'mensual';
function planTotal(pl){ return pl.items.reduce((a, i) => a + i.amount, 0); }
const savedAccs = pl => new Set(pl.items.filter(i => !isGastoItem(i) && i.acc).map(i => i.acc).concat(pl.surplus ? [pl.surplus] : []));

/* lo real del periodo contra el plan */
function planReal(pl, p){
  const r = {}; pl.items.forEach(i => r[i.id] = 0);
  let out = 0, fromSaved = 0, inc = 0; const outCats = {}, saved = savedAccs(pl);
  for (const t of S.transactions) {
    if (!inP(t, p)) continue;
    if (t.type === 'ingreso') inc += t.amount;
    else if (t.type === 'gasto') {
      const it = itemOfCat(pl, t.categoryId);
      if (it) r[it.id] += t.amount;
      else if (saved.has(t.fund || t.accountId)) fromSaved += t.amount;
      else { out += t.amount; const pc = parentOf(cat(t.categoryId)); const k = pc ? pc.id : '_'; outCats[k] = (outCats[k] || 0) + t.amount; }
    } else if (t.type === 'transferencia') {
      const it = pl.items.find(i => !isGastoItem(i) && i.acc === t.toAccountId && t.accountId !== i.acc);
      if (it) r[it.id] += t.amount;
    }
  }
  return { r, out, outCats, fromSaved, inc };
}

/* repartir el sueldo: cuánto debe salir de la cuenta del sueldo hacia cada cuenta */
function planDests(pl, p){
  const m = {};
  for (const i of pl.items) if (i.acc && i.acc !== pl.from) { const d = m[i.acc] = m[i.acc] || { acc:i.acc, amount:0, names:[] }; d.amount += i.amount; d.names.push(i.name); }
  for (const d of Object.values(m)) d.done = S.transactions.filter(t => t.type === 'transferencia' && t.toAccountId === d.acc && t.accountId !== d.acc && inP(t, p)).reduce((a, t) => a + t.amount, 0);
  return Object.values(m).sort((a, b) => b.amount - a.amount);
}
function planLeftover(pl, p, R){
  if (!pl.from || !pl.surplus) return 0;
  const bal = balances()[pl.from] || 0;
  let need = 0;
  for (const i of pl.items) if (i.acc === pl.from) need += Math.max(0, i.amount - (R.r[i.id] || 0));
  for (const d of planDests(pl, p)) need += Math.max(0, d.amount - d.done);
  const B = balances(); for (const a of S.accounts) if (a.card && a.card.pocket === pl.from) need += Math.max(0, -(B[a.id] || 0)); // lo que se debe en la tarjeta ya está comprometido
  return Math.max(0, bal - need);
}

function donut(segs, size){
  const r = 54, c = 2 * Math.PI * r, tot = segs.reduce((a, s) => a + s.v, 0) || 1; let off = 0, g = '';
  for (const s of segs) { const len = s.v / tot * c; const gap = segs.length > 1 ? Math.min(4, len * .3) : 0;
    g += '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="16" stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + ' ' + c.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>'; off += len; }
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 140 140" aria-hidden="true" style="flex:0 0 auto"><circle cx="70" cy="70" r="' + r + '" fill="none" stroke="rgba(255,255,255,.05)" stroke-width="16"/>' + g + '</svg>';
}
const accShort = id => { const a = accById(id); if (!a) return 'Sin cuenta'; const m = a.name.match(/^\(([^)]+)\)/); return m ? m[1].replace(/[^\p{L}\p{N} ]/gu, '').trim() : a.name; };

function vPlan(p){
  const pl = planFor(p);
  let out = '<div class="hello"><h1>Tu <em>plan</em></h1><p>Lo que planeaste contra lo que pasó, del ' + fmtShort(p.start) + ' al ' + fmtShort(p.end) + '</p></div>';
  if (!pl) {
    const has = Object.keys(S.budgets || {}).length;
    return out + '<section class="card glow"><h2 style="margin:0;font-size:17px;font-weight:500">Arma tu plan del mes</h2><p class="insight">Define cuánto entra y a dónde va cada peso: lo que gastas por categoría y lo que guardas en tus cuentas de ahorro. Caudal lo compara con lo que registras y te arma el reparto del día de pago.</p>' +
      '<button class="btn" data-pnew>' + (has ? 'Crear plan desde mis presupuestos' : 'Crear mi plan') + '</button></section>';
  }
  const R = planReal(pl, p), N = daysIn(p), ti = todayIdx(p), today = iso(new Date());
  const isCur = today >= p.s && today <= p.e, el = isCur ? (ti + 1) / N : 1;
  const total = planTotal(pl), gasto = pl.items.filter(isGastoItem);
  const left = gasto.reduce((a, i) => a + Math.max(0, itemBudget(pl, i, p) - R.r[i.id]), 0);
  const free = pl.income - total;

  /* resumen */
  out += '<section class="card glow"><div class="card-h"><span class="label">' + (isCur ? 'Te queda por gastar del plan' : 'Quedó sin gastar del plan') + '</span><button class="pill" data-pedit>' + esc(pl.name || 'Plan') + '</button></div>' +
    '<div class="big num"><small>$</small>' + nf.format(left) + '</div>' +
    '<div class="flowbar" aria-hidden="true">' + CLS.map(([k, col]) => { const v = pl.items.filter(i => i.cls === k).reduce((a, i) => a + i.amount, 0); return v ? '<i style="width:' + (v / Math.max(total, pl.income) * 100).toFixed(1) + '%;background:' + col + '"></i>' : ''; }).join('') + '</div>' +
    '<div class="stats3"><div><span>Ingreso del plan</span><b class="num">' + money(pl.income) + '</b></div><div><span>Ha entrado</span><b class="num ' + (R.inc >= pl.income ? 'pos' : '') + '">' + money(R.inc) + '</b></div>' +
    '<div><span>' + (free >= 0 ? 'Sin asignar' : 'Asignas de más') + '</span><b class="num ' + (free < 0 ? 'neg' : '') + '">' + money(Math.abs(free)) + '</b></div></div></section>';

  out += repartirCard(pl, p, R, isCur);

  /* cómo se reparte */
  const mode = ui.pmode || 'cls';
  let segs;
  if (mode === 'cls') segs = CLS.map(([k, col]) => { const its = pl.items.filter(i => i.cls === k); return { name:k, color:col, v:its.reduce((a, i) => a + i.amount, 0), real:its.reduce((a, i) => a + R.r[i.id], 0) }; });
  else if (mode === 'flujo') { const f = pl.items.filter(isGastoItem), g = pl.items.filter(i => !isGastoItem(i));
    segs = [{ name:'En el flujo del mes', color:'#b8709f', v:f.reduce((a, i) => a + i.amount, 0), real:f.reduce((a, i) => a + R.r[i.id], 0) }, { name:'Guardado', color:'#4d93e0', v:g.reduce((a, i) => a + i.amount, 0), real:g.reduce((a, i) => a + R.r[i.id], 0) }]; }
  else { const m = {}; for (const i of pl.items) { const k = i.acc || '_'; m[k] = m[k] || { name:accShort(i.acc), v:0, real:0 }; m[k].v += i.amount; m[k].real += R.r[i.id]; }
    segs = Object.values(m).sort((a, b) => b.v - a.v).map((s, k) => ({ ...s, color:ACC_COLORS[k % ACC_COLORS.length] })); }
  segs = segs.filter(s => s.v > 0);
  out += '<section class="card"><div class="card-h"><h2>Cómo se reparte</h2></div><div class="pills">' + [['cls','Clasificación'],['flujo','Flujo o guardado'],['acc','Por cuenta']].map(([k, l]) => '<button class="pill" data-pmode="' + k + '" aria-pressed="' + (mode === k) + '">' + l + '</button>').join('') + '</div>' +
    '<div class="pdonut">' + donut(segs, 132) + '<div class="plegend">' + segs.map(s => '<div><i style="background:' + s.color + '"></i><span class="nm">' + esc(s.name) + '</span><span class="num">' + money(s.v) + '</span><span class="pc num">' + Math.round(s.v / (pl.income || total || 1) * 100) + '%</span></div>').join('') + '</div></div>' +
    '<div>' + segs.map(s => { const pct = s.v ? s.real / s.v : 0;
      return '<div class="set"><div class="t"><b>' + esc(s.name) + '</b><span>' + money(s.real) + ' de ' + money(s.v) + ' ejecutado</span></div><span class="num ' + (pct > 1.001 ? 'neg' : '') + '">' + Math.round(pct * 100) + '%</span></div>'; }).join('') + '</div></section>';

  /* rubros */
  out += '<section class="card"><div class="card-h"><h2>Rubros</h2><button class="pill" data-padd>Agregar</button></div>';
  if (isCur) out += '<div class="legend"><span><i class="box" style="background:var(--sale)"></i>Gastado o guardado</span><span><span style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid var(--muted)"></span>Dónde deberías ir hoy</span></div>';
  out += '<div>';
  for (const [k, col] of CLS.concat([['_otros', '#8d858c']])) {
    const its = pl.items.filter(i => k === '_otros' ? !CLS.some(c => c[0] === i.cls) : i.cls === k); if (!its.length) continue;
    out += '<div class="pgroup"><i style="background:' + col + '"></i>' + (k === '_otros' ? 'Otros' : k) + '<span class="num">' + money(its.reduce((a, i) => a + i.amount, 0)) + '</span></div>';
    for (const i of its) {
      const s = R.r[i.id], b = itemBudget(pl, i, p), mx = Math.max(b, s, 1) * 1.04, g = isGastoItem(i), ideal = g ? b * el : b;
      let cls = '', msg;
      if (!g) { msg = s >= b ? 'Guardado ✓' : s > 0 ? 'Faltan ' + money(b - s) : 'Por guardar'; cls = s >= b ? 'pos' : ''; }
      else if (isFijo(i)) { [cls, msg] = fijoState(s, b); }
      else if (s > b) { cls = 'neg'; msg = 'Te pasaste ' + money(s - b); }
      else if (isCur && s > ideal * 1.1 && s > 0) { cls = 'warn'; msg = 'Vas rápido · quedan ' + money(b - s); }
      else msg = 'Quedan ' + money(b - s);
      const c0 = g ? cat(i.cats[0]) : null;
      out += '<button class="bullet pitem" data-pitem="' + esc(i.id) + '"><div class="catline"><span class="em">' + esc(g ? ((c0 && c0.emoji) || '•') : '⤵') + '</span><span class="nm">' + esc(i.name) + '</span><span class="am num ' + cls + '">' + msg + '</span></div>' +
        '<div class="btrack"><div class="fill ' + (cls === 'pos' ? '' : cls) + '" style="width:' + (s / mx * 100).toFixed(1) + '%' + (g ? '' : ';background:linear-gradient(90deg,#2f5680,var(--entra))') + '"></div><div class="cap" style="left:calc(' + (b / mx * 100).toFixed(1) + '% - 1px)"></div>' + (isCur && g && !isFijo(i) ? '<div class="pace" style="left:' + (ideal / mx * 100).toFixed(1) + '%"></div>' : '') + '</div>' +
        '<div class="meta num"><span>' + money(s) + ' de ' + money(b) + ((i.every || 1) > 1 ? ' · se paga ' + everyTxt(i.every) + ', apartas ' + money(i.amount) + ' al mes' : g && isFijo(i) ? ' · pago fijo' : '') + '</span><span>' + esc(accShort(i.acc)) + '</span></div></button>';
    }
  }
  out += '</div></section>';

  /* fuera del plan */
  if (R.out > 0 || R.fromSaved > 0) {
    const rows = Object.entries(R.outCats).sort((a, b) => b[1] - a[1]).slice(0, 6);
    out += '<section class="card"><div class="card-h"><h2>Fuera del plan</h2><span class="aside num">' + money(R.out) + '</span></div>' +
      '<p class="insight">' + (R.out > 0 ? 'Gastos en categorías que ningún rubro cubre.' : 'Todo tu gasto cae dentro de algún rubro.') + (R.fromSaved > 0 ? ' Además pagaste <b>' + money(R.fromSaved) + '</b> con tus ahorros.' : '') + '</p>' +
      (rows.length ? '<div>' + rows.map(([id, v]) => { const c = cat(id); return '<div class="set"><div class="t"><b>' + esc(c ? c.emoji + ' ' + c.name : 'Sin categoría') + '</b></div><span class="num">' + money(v) + '</span></div>'; }).join('') + '</div>' : '') + '</section>';
  }

  /* versiones */
  const vs = (S.plans || []).slice().sort((a, b) => b.start.localeCompare(a.start));
  out += '<section class="card"><div class="card-h"><h2>Versiones del plan</h2><button class="pill" data-pver>Nueva versión</button></div><p class="insight">Cuando cambie tu ingreso o tu reparto, crea una versión nueva: cada periodo se compara con el plan que tenías vigente.</p><div>' +
    vs.map(v => '<button class="acc" data-pedit="' + esc(v.id) + '"><span class="nm">' + esc(v.name || 'Plan') + (v.id === pl.id ? ' · vigente aquí' : '') + '<br><span class="tile-s">Desde el ' + parseISO(v.start).getDate() + ' de ' + MESL[parseISO(v.start).getMonth()] + ' de ' + v.start.slice(0, 4) + ' · ' + v.items.length + ' rubros</span></span><span class="am num">' + money(v.income) + '</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>').join('') + '</div></section>';
  return out;
}

function repartirCard(pl, p, R, isCur){
  const ds = planDests(pl, p); if (!ds.length) return '';
  const pend = ds.filter(d => d.done < d.amount), si = isCur ? sobranteInfo() : null, left = si && si.cerca ? si.left : 0;
  /* el sobrante solo se ofrece en los primeros 5 días del periodo: es lo que quedó del periodo anterior */
  let h = '<section class="card"><div class="card-h"><h2>Repartir el sueldo</h2><span class="aside">desde ' + esc(accShort(pl.from)) + '</span></div>' +
    '<p class="insight">' + (pend.length ? (isCur ? 'Mueve cada parte a su cuenta. Un toque y queda registrada la transferencia.' : 'Esto quedó sin mover en ese periodo.') : '<b>Todo repartido.</b> Cada cuenta recibió lo de su plan.') + '</p><div>';
  for (const d of ds) {
    const ok = d.done >= d.amount, falta = d.amount - d.done;
    h += '<div class="prep' + (ok ? ' ok' : '') + '"><div class="rmain"><b>' + esc(accShort(d.acc)) + '</b><span>' + esc(d.names.join(', ') === accShort(d.acc) ? 'Ahorro del mes' : d.names.join(', ')) + '</span></div><div class="ramt num"><span>' + money(d.amount) + '</span>' + (d.done && !ok ? '<small>faltan ' + money(falta) + '</small>' : '') + '</div>' +
      (ok ? '<span class="pchk" aria-label="Hecho">✓</span>' : isCur && pl.from ? '<button class="pill solid" data-prep="' + esc(d.acc) + '">Mover</button>' : '') + '</div>';
  }
  if (left >= 1000) h += '<div class="prep"><div class="rmain"><b>Sobrante</b><span>Lo que quedó del periodo anterior en ' + esc(accShort(pl.from)) + '</span></div><div class="ramt num"><span>' + money(left) + '</span></div><button class="pill solid" data-sobra>Repartir</button></div>';
  h += '</div>';
  if (isCur && pl.from && pend.length > 1) h += '<button class="btn block" data-prepall>Mover todo · ' + money(pend.reduce((a, d) => a + d.amount - d.done, 0)) + '</button>';
  return h + '</section>';
}

function planMove(pl, acc, amount, note){
  if (!pl.from || !amount) return;
  S.transactions.push({ id:uid(), type:'transferencia', amount:Math.round(amount), date:iso(new Date()), ts:Date.now(), accountId:pl.from, toAccountId:acc, note, src:'plan' });
}

/* ----- editar plan y rubros ----- */
let PF = null, IF = null;
function newPlan(fromBudgets){
  const p = period(0), sal = S.categories.find(c => c.type === 'ingreso' && !c.parentId && /salari|sueldo|n[oó]mina/i.test(c.name));
  const from = (() => { const t = S.transactions.find(x => x.type === 'ingreso' && sal && x.categoryId === sal.id); return t ? t.accountId : lastAccount(); })();
  const pl = { id:uid(), name:'Plan ' + p.start.getFullYear(), income:(sal && S.budgets[sal.id]) || 0, start:p.s, from, surplus:null, items:[] };
  if (fromBudgets) for (const [id, v] of Object.entries(S.budgets || {})) { const c = cat(id); if (!c || c.type !== 'gasto') continue;
    pl.items.push({ id:uid(), name:c.name, amount:v, cls:'Esenciales', cats:[id], acc:from }); }
  return pl;
}
function planSheet(pl){
  PF = pl;
  const v = pl.items.slice().sort((a, b) => b.amount - a.amount), total = planTotal(pl);
  let h = '<div class="sheet-h"><b id="sheet-title">' + esc(pl.name || 'Plan') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<div class="field"><label class="label" for="p-name">Nombre de esta versión</label><input class="inp" id="p-name" value="' + esc(pl.name || '') + '" autocomplete="off"></div>' +
    '<div class="two"><div class="field"><label class="label" for="p-inc">Ingreso mensual</label><input class="inp num" id="p-inc" inputmode="numeric" value="' + (pl.income ? nf.format(pl.income) : '') + '" placeholder="0"></div>' +
    '<div class="field"><label class="label" for="p-start">Vigente desde</label><input class="inp" type="date" id="p-start" value="' + esc(pl.start) + '"></div></div>' +
    '<div class="field"><label class="label" for="p-from">Cuenta donde llega el sueldo</label><select class="inp" id="p-from">' + accOptions(pl.from, 'Elige una cuenta') + '</select></div>' +
    '<div class="field"><label class="label" for="p-sur">Cuenta para lo que sobre</label><select class="inp" id="p-sur">' + accOptions(pl.surplus, 'Ninguna') + '</select></div>' +
    '<div><div class="card-h" style="margin-bottom:4px"><span class="label">Rubros · ' + money(total) + ' de ' + money(pl.income) + '</span><button class="pill" type="button" data-padd>Agregar</button></div>' +
    v.map(i => '<button class="acc" type="button" data-pitem="' + esc(i.id) + '"><span class="pdot" style="background:' + clsColor(i.cls) + '"></span><span class="nm">' + esc(i.name) + '<br><span class="tile-s">' + esc(i.cls) + ' · ' + (isGastoItem(i) ? 'gasto' : 'ahorro') + ' · ' + esc(accShort(i.acc)) + '</span></span><span class="am num">' + money(i.amount) + '</span></button>').join('') + '</div>' +
    '<button class="btn block" type="button" data-close>Listo</button>' +
    '<button class="btn ghost block" type="button" id="p-del">Eliminar esta versión</button></div>';
  openSheet(h);
}
function itemSheet(i){
  const pl = PF || planFor(period(ui.offset)); if (!pl) return;
  PF = pl;
  IF = i ? JSON.parse(JSON.stringify(i)) : { id:null, name:'', amount:0, cls:'Esenciales', cats:[], acc:pl.from, every:1 };
  const g = IF.id ? isGastoItem(IF) : true; IF._g = g;
  const sel = new Set(IF.cats || []);
  const chips = S.categories.filter(c => !c.parentId && c.type === 'gasto' && (!c.hidden || sel.has(c.id))).map(p0 =>
    '<div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-pcat="' + esc(p0.id) + '" aria-pressed="' + sel.has(p0.id) + '">' + esc(p0.emoji + ' ' + p0.name) + '</button>' +
    S.categories.filter(c => c.parentId === p0.id && (!c.hidden || sel.has(c.id))).map(s => '<button type="button" class="chip sub" data-pcat="' + esc(s.id) + '" aria-pressed="' + sel.has(s.id) + '">' + esc(s.name) + '</button>').join('') + '</div>').join('');
  const h = '<div class="sheet-h"><b id="sheet-title">' + (IF.id ? esc(IF.name) : 'Nuevo rubro') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="pitemf" novalidate>' +
    '<div class="field"><label class="label" for="i-name">Nombre</label><input class="inp" id="i-name" value="' + esc(IF.name) + '" placeholder="Ej. Mercado, Ahorro moto" autocomplete="off"></div>' +
    '<div class="field"><label class="label" for="i-amt">Valor mensual</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="i-amt" inputmode="numeric" class="num" value="' + (IF.amount ? nf.format(IF.amount) : '') + '" placeholder="0" style="font-size:28px"></div></div>' +
    '<div class="field"><span class="label">Clasificación</span><div class="chips">' + CLS.map(([k]) => '<button type="button" class="chip" data-pcls="' + k + '" aria-pressed="' + (IF.cls === k) + '">' + k + '</button>').join('') + '</div></div>' +
    '<div class="field"><span class="label">Se paga</span><div class="chips">' + [[1,'Cada mes'],[2,'Cada 2 meses'],[3,'Cada 3 meses']].map(([n, l]) => '<button type="button" class="chip" data-pevery="' + n + '" aria-pressed="' + ((IF.every || 1) === n) + '">' + l + '</button>').join('') + '</div><span class="tile-s">El valor mensual es lo que apartas cada mes. Si se paga cada 2 meses, el tope del mes del pago suma lo apartado.</span></div>' +
    '<div class="field" id="i-fijo"' + (g ? '' : ' hidden') + '><span class="label">Cómo se gasta</span><div class="chips"><button type="button" class="chip" data-pfijo="0" aria-pressed="' + !isFijo({ ...IF, cats:IF.cats.length ? IF.cats : ['x'] }) + '">Poco a poco en el mes</button><button type="button" class="chip" data-pfijo="1" aria-pressed="' + isFijo({ ...IF, cats:IF.cats.length ? IF.cats : ['x'] }) + '">De una vez (pago fijo)</button></div><span class="tile-s">Los pagos fijos (cadenas, recibos) no se miden por ritmo diario: solo si ya los pagaste.</span></div>' +
    '<div class="field"><span class="label">Cómo se cumple</span><div class="chips"><button type="button" class="chip" data-pkind="g" aria-pressed="' + g + '">Gastando en categorías</button><button type="button" class="chip" data-pkind="a" aria-pressed="' + !g + '">Transfiriendo a una cuenta</button></div></div>' +
    '<div class="field" id="i-cats"' + (g ? '' : ' hidden') + '><span class="label">Categorías que cuentan para este rubro</span><div>' + chips + '</div></div>' +
    '<div class="field"><label class="label" for="i-acc" id="i-acc-l">' + (g ? 'Dónde vive esta plata' : 'Cuenta de ahorro') + '</label><select class="inp" id="i-acc">' + accOptions(IF.acc, 'Sin cuenta') + '</select></div><div class="err" id="i-err"></div>' +
    '<button class="btn block" type="submit">' + (IF.id ? 'Guardar rubro' : 'Agregar rubro') + '</button>' +
    (IF.id ? '<button class="btn ghost block" type="button" id="i-del">Eliminar rubro</button>' : '') + '</form>';
  openSheet(h);
}
function readItem(){
  IF.name = $('#i-name').value.trim(); IF.amount = parseInt(($('#i-amt').value || '').replace(/\D/g, ''), 10) || 0; IF.acc = $('#i-acc').value || null;
  IF.cats = IF._g ? [...document.querySelectorAll('[data-pcat][aria-pressed="true"]')].map(b => b.dataset.pcat) : [];
  return !IF.name ? 'Escribe un nombre.' : !IF.amount ? 'Escribe el valor mensual.' : IF._g && !IF.cats.length ? 'Elige al menos una categoría.' : !IF._g && !IF.acc ? 'Elige la cuenta de ahorro.' : '';
}

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.pmode) { ui.pmode = d.pmode; return render(); }
  if (d.pnew !== undefined) { const pl = newPlan(Object.keys(S.budgets || {}).length > 0); (S.plans = S.plans || []).push(pl); save(); render(); return planSheet(pl); }
  if (d.pedit !== undefined) { const pl = d.pedit ? S.plans.find(x => x.id === d.pedit) : planFor(period(ui.offset)); if (pl) planSheet(pl); return; }
  if (d.pver !== undefined) { const cur = planFor(period(0)) || planFor(period(ui.offset)); const p0 = period(0);
    const pl = cur ? { ...JSON.parse(JSON.stringify(cur)), id:uid(), name:'Plan ' + MESL[p0.start.getMonth()] + ' ' + p0.start.getFullYear(), start:p0.s } : newPlan(false);
    pl.items.forEach(i => i.id = uid()); (S.plans = S.plans || []).push(pl); save(); render(); toast('Versión creada desde el ' + fmtShort(p0.start)); return planSheet(pl); }
  if (d.pitem) { const pl = (PF && PF.items.some(i => i.id === d.pitem)) ? PF : planFor(period(ui.offset)); if (!pl) return; PF = pl; return itemSheet(pl.items.find(i => i.id === d.pitem)); }
  if (d.padd !== undefined) { if (!PF) PF = planFor(period(ui.offset)); return itemSheet(null); }
  if (d.prep || d.prepall !== undefined || d.pexc) {
    const p = period(ui.offset), pl = planFor(p); if (!pl || !pl.from) return toast('Elige la cuenta donde llega el sueldo');
    if (d.pexc) { planMove(pl, pl.surplus, +d.pexc, 'Sobrante del plan'); save(); render(); return toast('Sobrante movido a ' + accShort(pl.surplus)); }
    const ds = planDests(pl, p).filter(x => x.done < x.amount && (d.prepall !== undefined || x.acc === d.prep));
    ds.forEach(x => planMove(pl, x.acc, x.amount - x.done, 'Plan: ' + x.names.join(', ')));
    save(); render(); return toast(ds.length === 1 ? 'Movido a ' + accShort(ds[0].acc) : ds.length + ' transferencias registradas', 2600);
  }
  if (d.pcls && IF) { IF.cls = d.pcls; document.querySelectorAll('[data-pcls]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  if (d.pkind && IF) { IF._g = d.pkind === 'g'; document.querySelectorAll('[data-pkind]').forEach(b => b.setAttribute('aria-pressed', b === el)); $('#i-cats').hidden = !IF._g; $('#i-fijo').hidden = !IF._g; $('#i-acc-l').textContent = IF._g ? 'Dónde vive esta plata' : 'Cuenta de ahorro'; return; }
  if (d.pfijo !== undefined && IF) { IF.fijo = d.pfijo === '1'; document.querySelectorAll('[data-pfijo]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  if (d.pevery && IF) { IF.every = +d.pevery; document.querySelectorAll('[data-pevery]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  if (d.pcat && IF) { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'); return; }
  if (el.id === 'i-del' && IF && PF) { if (!IF._arm) { IF._arm = true; el.textContent = 'Toca otra vez para eliminar'; el.className = 'btn danger block'; return; }
    PF.items = PF.items.filter(i => i.id !== IF.id); save(); const pl = PF; IF = null; render(); toast('Rubro eliminado'); return planSheet(pl); }
  if (el.id === 'p-del' && PF) { if (!PF._arm) { PF._arm = true; el.textContent = 'Toca otra vez para eliminar la versión'; el.className = 'btn danger block'; return; }
    S.plans = S.plans.filter(x => x.id !== PF.id); save(); closeSheet(); render(); return toast('Versión eliminada'); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'pitemf') return; e.preventDefault();
  const err = readItem(); if (err) { $('#i-err').textContent = err; return; }
  const it = { id:IF.id || uid(), name:IF.name, amount:IF.amount, cls:IF.cls, cats:IF.cats, acc:IF.acc }; if ((IF.every || 1) > 1) it.every = IF.every; if (typeof IF.fijo === 'boolean') it.fijo = IF.fijo;
  const k = PF.items.findIndex(i => i.id === it.id); if (k >= 0) PF.items[k] = it; else PF.items.push(it);
  save(); const pl = PF, isNew = k < 0; IF = null; render(); toast(isNew ? 'Rubro agregado' : 'Rubro guardado'); planSheet(pl);
}, true);
document.addEventListener('input', e => { const t = e.target; if (t.id === 'i-amt' || t.id === 'p-inc') { const v = parseInt(t.value.replace(/\D/g, ''), 10); t.value = v ? nf.format(v) : ''; } });
document.addEventListener('change', e => {
  const t = e.target; if (!PF || !/^p-(name|inc|start|from|sur)$/.test(t.id)) return;
  if (t.id === 'p-name') PF.name = t.value.trim() || 'Plan';
  if (t.id === 'p-inc') PF.income = parseInt(t.value.replace(/\D/g, ''), 10) || 0;
  if (t.id === 'p-start' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) PF.start = t.value;
  if (t.id === 'p-from') PF.from = t.value || null;
  if (t.id === 'p-sur') PF.surplus = t.value || null;
  save(); render();
});

/* proyección de cierre del periodo: los rubros de gasto frecuente (3 o más movimientos) siguen su ritmo;
   los de pago puntual (servicios, cuotas) se cuentan por su valor de plan o lo ya pagado si fue más */
function planProjection(pl, p, ti, N){
  let tot = 0;
  for (const i of pl.items.filter(isGastoItem)) {
    let s = 0, n = 0;
    for (const t of S.transactions) if (t.type === 'gasto' && inP(t, p) && itemOfCat(pl, t.categoryId) === i) { s += t.amount; n++; }
    const b = itemBudget(pl, i, p);
    tot += isFijo(i) ? Math.max(s, b) : n >= 3 ? s / (ti + 1) * N : Math.max(s, b);
  }
  return tot;
}

/* ----- Inicio: avance de cada presupuesto del plan ----- */
function budCard(p){
  const pl = planFor(p); if (!pl) return '';
  const gasto = pl.items.filter(isGastoItem); if (!gasto.length) return '';
  const R = planReal(pl, p), N = daysIn(p), ti = todayIdx(p), today = iso(new Date());
  const isCur = today >= p.s && today <= p.e, el = isCur ? (ti + 1) / N : 1, daysLeft = isCur ? N - ti : 0;
  const rows = gasto.map(i => { const b = itemBudget(pl, i, p), s = R.r[i.id] || 0; return { i, b, s, pct:b ? s / b : (s ? 9 : 0) }; })
    .sort((x, y) => (y.s > y.b) - (x.s > x.b) || y.pct - x.pct);
  const open = ui.budAll, show = open ? rows : rows.slice(0, 4);
  let h = '<section class="card"><div class="card-h"><h2>Tus presupuestos</h2><button class="pill" data-go="plan">Plan</button></div>' +
    (isCur ? '<p class="note" style="padding:0;margin:-4px 0 6px">▾ dónde deberías ir hoy · │ tope</p>' : '');
  for (const { i, b, s } of show) {
    const left = b - s, mx = Math.max(b, s, 1) * 1.04, ideal = b * el, c0 = cat(i.cats[0]);
    let cls = '', msg;
    const fx = isFijo(i);
    if (s > b * 1.02) { cls = 'neg'; msg = 'Te pasaste ' + money(s - b); }
    else if (fx) [cls, msg] = fijoState(s, b);
    else if (isCur && s > ideal * 1.1 && s > 0) { cls = 'warn'; msg = 'Quedan ' + money(left); }
    else msg = 'Quedan ' + money(left);
    const sub = fx ? 'Pago fijo · ' + money(s) + ' de ' + money(b) : s > b ? money(s) + ' de ' + money(b) : isCur && daysLeft ? money(s) + ' de ' + money(b) + ' · ' + money(left / daysLeft) + ' por día' : money(s) + ' de ' + money(b);
    h += '<button class="bullet pitem" data-pbud="' + esc(i.id) + '"><div class="catline"><span class="em">' + esc((c0 && c0.emoji) || '•') + '</span><span class="nm">' + esc(i.name) + '</span><span class="am num ' + cls + '">' + msg + '</span></div>' +
      '<div class="btrack"><div class="fill ' + (cls === 'pos' ? '' : cls) + '" style="width:' + (s / mx * 100).toFixed(1) + '%"></div><div class="cap" style="left:calc(' + (b / mx * 100).toFixed(1) + '% - 1px)"></div>' + (isCur && !fx ? '<div class="pace" style="left:' + (ideal / mx * 100).toFixed(1) + '%"></div>' : '') + '</div>' +
      '<div class="meta num"><span>' + sub + '</span>' + (cls === 'warn' ? '<span class="warn">Vas rápido</span>' : '') + '</div></button>';
  }
  if (rows.length > 4) h += '<button class="btn ghost block" data-budall>' + (open ? 'Ver menos' : 'Ver los ' + rows.length + ' presupuestos') + '</button>';
  return h + '</section>';
}
function budSheet(id){
  const p = period(ui.offset), pl = planFor(p), it = pl && pl.items.find(i => i.id === id); if (!it) return;
  const list = S.transactions.filter(t => t.type === 'gasto' && inP(t, p) && itemOfCat(pl, t.categoryId) === it);
  const s = list.reduce((a, t) => a + t.amount, 0), b = itemBudget(pl, it, p);
  let h = '<div class="sheet-h"><b id="sheet-title">' + esc(it.name) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + (s > b ? 'Te pasaste' : 'Te queda') + '</span><div class="tile-v num ' + (s > b ? 'neg' : '') + '">' + money(Math.abs(b - s)) + '</div><span class="tile-s">Llevas ' + money(s) + ' de ' + money(b) + ' en ' + list.length + (list.length === 1 ? ' gasto' : ' gastos') + '</span></section>';
  h += list.length ? '<div>' + list.map(txRow).join('') + '</div>' : '<div class="empty">Sin gastos en este presupuesto.</div>';
  h += '<button class="btn ghost block" type="button" data-pitemgo="' + esc(it.id) + '">Editar en el plan</button></div>';
  openSheet(h);
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.pbud) { e.stopPropagation(); return budSheet(el.dataset.pbud); }
  if (el.dataset.budall !== undefined) { e.stopPropagation(); ui.budAll = !ui.budAll; return render(); }
  if (el.dataset.pitemgo) { e.stopPropagation(); closeSheet(); go('plan'); return; }
}, true);

/* ----- al registrar: cuánto queda en ese presupuesto antes de guardar ----- */
function formBud(){
  if (!F || F.type !== 'gasto' || !(F.sub || F.parent)) return '';
  const cid = F.sub || F.parent, p = periodFor(F.date || iso(new Date())), pl = planFor(p);
  let name, b, s = 0;
  const it = pl && itemOfCat(pl, cid);
  if (it) { name = it.name; b = itemBudget(pl, it, p); for (const t of S.transactions) if (t.id !== F.id && t.type === 'gasto' && inP(t, p) && itemOfCat(pl, t.categoryId) === it) s += t.amount; }
  else { const pc = parentOf(cat(cid)); b = pc && (S.budgets || {})[pc.id]; if (!b) return pl ? '<div class="fbud" id="f-bud" data-left="" ><span>Fuera del plan</span></div>' : ''; name = pc.name;
    for (const t of S.transactions) if (t.id !== F.id && t.type === 'gasto' && inP(t, p) && parentOf(cat(t.categoryId)) === pc) s += t.amount; }
  return '<div class="fbud" id="f-bud" data-left="' + (b - s) + '" data-name="' + esc(name) + '">' + fbudTxt(name, b - s, Math.abs(F.amount || 0)) + '</div>';
}
function fbudTxt(name, left, amt){
  if (!amt) return left >= 0 ? '<span>' + esc(name) + ': te quedan <b>' + money(left) + '</b></span>' : '<span>' + esc(name) + ': ya te pasaste <b class="neg">' + money(-left) + '</b></span>';
  const after = left - amt;
  return after >= 0 ? '<span>' + esc(name) + ': después de este gasto te quedan <b>' + money(after) + '</b></span>' : '<span>' + esc(name) + ': con este gasto te pasas <b class="neg">' + money(-after) + '</b></span>';
}
document.addEventListener('input', e => {
  if (e.target.id !== 'f-amt') return; const box = $('#f-bud'); if (!box || box.dataset.left === '') return;
  const v = parseInt((e.target.value || '').replace(/\D/g, ''), 10) || 0; box.innerHTML = fbudTxt(box.dataset.name, +box.dataset.left, v);
});

/* ----- repartir lo que sobró del mes: a Excedentes o entre los bolsillos de ahorro ----- */
let SOB = null;
function sobranteInfo(){
  const p = period(0), pl = planFor(p); if (!pl || !pl.from) return null;
  const N = daysIn(p), ti = todayIdx(p), cerca = ti >= N - 3 || ti <= 5;
  const since = iso(new Date(Date.now() - 10 * 864e5));
  if (S.transactions.some(t => t.src === 'sobrante' && t.date >= since)) return null;
  const R = planReal(pl, p), left = Math.floor(planLeftover({ ...pl, surplus:pl.surplus || pl.from }, p, R) / 1000) * 1000;
  return { pl, p, left, cerca };
}
function sobranteCard(){
  const s = sobranteInfo(); if (!s || !s.cerca || s.left < 20000) return '';
  return '<div class="banner"><span><b>Te sobraron ' + money(s.left) + ' en ' + esc(accShort(s.pl.from)) + '.</b> Decide a dónde va: Excedentes o tus bolsillos de ahorro.</span><button class="btn sm" data-sobra>Repartir</button></div>';
}
function sobranteOpen(){
  const s = sobranteInfo(); if (!s) return toast('Ya repartiste el sobrante de este periodo');
  const dests = S.accounts.filter(a => !a.hidden && !isCard(a) && a.id !== s.pl.from && (/ahorro/i.test(a.group || '') || a.id === s.pl.surplus));
  dests.sort((a, b) => (b.id === s.pl.surplus) - (a.id === s.pl.surplus));
  SOB = { ...s, dests, amt:Object.fromEntries(dests.map(a => [a.id, a.id === s.pl.surplus ? s.left : 0])) };
  sobDraw();
}
function sobDraw(){
  const used = Object.values(SOB.amt).reduce((a, v) => a + v, 0), rest = SOB.left - used;
  let h = '<div class="sheet-h"><b id="sheet-title">Repartir lo que sobró</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form sob">' +
    '<section class="card glow" style="padding:16px"><span class="label">Sobrante en ' + esc(accShort(SOB.pl.from)) + '</span><div class="tile-v num">' + money(SOB.left) + '</div><span class="tile-s">Ya descontado lo que debes en la tarjeta y lo que falta del plan.</span></section>' +
    '<div class="pills"><button class="pill" data-sobq="exc">Todo a ' + esc(accShort(SOB.pl.surplus || SOB.dests[0].id)) + '</button><button class="pill" data-sobq="igual">Repartir igual</button></div>';
  h += SOB.dests.map(a => '<div class="set"><div class="t"><b>' + esc(accShort(a.id)) + '</b><span>Tiene ' + money(balances()[a.id] || 0) + (a.apart ? ' · apartada' : '') + '</span></div><div class="rv-amt" style="max-width:150px"><span>$</span><input inputmode="numeric" class="num" data-sobacc="' + esc(a.id) + '" value="' + (SOB.amt[a.id] ? nf.format(SOB.amt[a.id]) : '') + '" placeholder="0"></div></div>').join('');
  h += '<p class="note" style="padding:0" id="sob-rest">' + (rest === 0 ? 'Todo asignado.' : rest > 0 ? 'Sin asignar: ' + money(rest) + ' (se queda en ' + esc(accShort(SOB.pl.from)) + ').' : 'Te pasas por ' + money(-rest) + '.') + '</p>' +
    '<button class="btn accent block" data-sobgo' + (rest < 0 || !used ? ' disabled' : '') + '>Mover ' + money(used) + '</button>' +
    '<p class="note" style="padding:0">Se registran como transferencias desde ' + esc(accShort(SOB.pl.from)) + '. Haz lo mismo en Lulo.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.sobacc; if (!k || !SOB) return;
  const v = parseInt((e.target.value || '').replace(/\D/g, ''), 10) || 0; SOB.amt[k] = v; e.target.value = v ? nf.format(v) : '';
  const used = Object.values(SOB.amt).reduce((a, x) => a + x, 0), rest = SOB.left - used, r = $('#sob-rest'), b = document.querySelector('[data-sobgo]');
  if (r) r.textContent = rest === 0 ? 'Todo asignado.' : rest > 0 ? 'Sin asignar: ' + money(rest) + ' (se queda en ' + accShort(SOB.pl.from) + ').' : 'Te pasas por ' + money(-rest) + '.';
  if (b) { b.disabled = rest < 0 || !used; b.textContent = 'Mover ' + money(used); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.sobra !== undefined) { e.stopPropagation(); return sobranteOpen(); }
  if (!SOB || !el.closest('.sob')) return;
  if (d.sobq) { e.stopPropagation(); const ids = SOB.dests.filter(a => !a.apart).map(a => a.id);
    for (const k in SOB.amt) SOB.amt[k] = 0;
    if (d.sobq === 'exc') SOB.amt[SOB.pl.surplus || ids[0]] = SOB.left;
    else { const each = Math.floor(SOB.left / ids.length / 1000) * 1000; ids.forEach(k => SOB.amt[k] = each); SOB.amt[ids[0]] += SOB.left - each * ids.length; }
    return sobDraw(); }
  if (d.sobgo !== undefined) { e.stopPropagation(); let n = 0;
    for (const [acc, v] of Object.entries(SOB.amt)) if (v > 0) { S.transactions.push({ id:uid(), type:'transferencia', amount:v, date:iso(new Date()), ts:Date.now(), accountId:SOB.pl.from, toAccountId:acc, note:'Sobrante del periodo', src:'sobrante' }); n++; }
    sortTx(S); save(); SOB = null; closeSheet(); render(); return toast(n === 1 ? 'Sobrante guardado' : 'Sobrante repartido en ' + n + ' bolsillos'); }
}, true);
