/* ---------- plan del mes: el presupuesto como fuente única ---------- */
const CLS = [['Ahorro', '#4d93e0'], ['Esenciales', '#b8709f'], ['No esenciales', '#E6B3D6']];
const clsColor = c => (CLS.find(x => x[0] === c) || [0, '#8d858c'])[1];
const ACC_COLORS = ['#b8709f', '#4d93e0', '#E6B3D6', '#7fb8a4', '#F2B866', '#9a8fd6', '#d98a7a', '#8d858c'];
const isGastoItem = i => (i.cats || []).length > 0;
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
function planTotal(pl){ return pl.items.reduce((a, i) => a + i.amount, 0); }
const savedAccs = pl => new Set(pl.items.filter(i => !isGastoItem(i) && i.acc).map(i => i.acc));

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
      else if (saved.has(t.accountId)) fromSaved += t.amount;
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
  const left = gasto.reduce((a, i) => a + Math.max(0, i.amount - R.r[i.id]), 0);
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
      const s = R.r[i.id], b = i.amount || 0, mx = Math.max(b, s, 1) * 1.04, g = isGastoItem(i), ideal = g ? b * el : b;
      let cls = '', msg;
      if (!g) { msg = s >= b ? 'Guardado ✓' : s > 0 ? 'Faltan ' + money(b - s) : 'Por guardar'; cls = s >= b ? 'pos' : ''; }
      else if (s > b) { cls = 'neg'; msg = 'Te pasaste ' + money(s - b); }
      else if (isCur && s > ideal * 1.1 && s > 0) { cls = 'warn'; msg = 'Vas rápido · quedan ' + money(b - s); }
      else msg = 'Quedan ' + money(b - s);
      const c0 = g ? cat(i.cats[0]) : null;
      out += '<button class="bullet pitem" data-pitem="' + esc(i.id) + '"><div class="catline"><span class="em">' + esc(g ? ((c0 && c0.emoji) || '•') : '⤵') + '</span><span class="nm">' + esc(i.name) + '</span><span class="am num ' + cls + '">' + msg + '</span></div>' +
        '<div class="btrack"><div class="fill ' + (cls === 'pos' ? '' : cls) + '" style="width:' + (s / mx * 100).toFixed(1) + '%' + (g ? '' : ';background:linear-gradient(90deg,#2f5680,var(--entra))') + '"></div><div class="cap" style="left:calc(' + (b / mx * 100).toFixed(1) + '% - 1px)"></div>' + (isCur && g ? '<div class="pace" style="left:' + (ideal / mx * 100).toFixed(1) + '%"></div>' : '') + '</div>' +
        '<div class="meta num"><span>' + money(s) + ' de ' + money(b) + '</span><span>' + esc(accShort(i.acc)) + '</span></div></button>';
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
  const pend = ds.filter(d => d.done < d.amount), left = isCur ? planLeftover(pl, p, R) : 0;
  let h = '<section class="card"><div class="card-h"><h2>Repartir el sueldo</h2><span class="aside">desde ' + esc(accShort(pl.from)) + '</span></div>' +
    '<p class="insight">' + (pend.length ? (isCur ? 'Mueve cada parte a su cuenta. Un toque y queda registrada la transferencia.' : 'Esto quedó sin mover en ese periodo.') : '<b>Todo repartido.</b> Cada cuenta recibió lo de su plan.') + '</p><div>';
  for (const d of ds) {
    const ok = d.done >= d.amount, falta = d.amount - d.done;
    h += '<div class="prep' + (ok ? ' ok' : '') + '"><div class="rmain"><b>' + esc(accShort(d.acc)) + '</b><span>' + esc(d.names.join(', ') === accShort(d.acc) ? 'Ahorro del mes' : d.names.join(', ')) + '</span></div><div class="ramt num"><span>' + money(d.amount) + '</span>' + (d.done && !ok ? '<small>faltan ' + money(falta) + '</small>' : '') + '</div>' +
      (ok ? '<span class="pchk" aria-label="Hecho">✓</span>' : isCur && pl.from ? '<button class="pill solid" data-prep="' + esc(d.acc) + '">Mover</button>' : '') + '</div>';
  }
  if (left >= 1000) h += '<div class="prep"><div class="rmain"><b>' + esc(accShort(pl.surplus)) + '</b><span>Lo que sobra en ' + esc(accShort(pl.from)) + ' tras cubrir el plan</span></div><div class="ramt num"><span>' + money(left) + '</span></div><button class="pill" data-pexc="' + left + '">Mover</button></div>';
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
  IF = i ? JSON.parse(JSON.stringify(i)) : { id:null, name:'', amount:0, cls:'Esenciales', cats:[], acc:pl.from };
  const g = IF.id ? isGastoItem(IF) : true; IF._g = g;
  const sel = new Set(IF.cats || []);
  const chips = S.categories.filter(c => !c.parentId && c.type === 'gasto' && (!c.hidden || sel.has(c.id))).map(p0 =>
    '<div class="chips" style="margin-bottom:8px"><button type="button" class="chip" data-pcat="' + esc(p0.id) + '" aria-pressed="' + sel.has(p0.id) + '">' + esc(p0.emoji + ' ' + p0.name) + '</button>' +
    S.categories.filter(c => c.parentId === p0.id && (!c.hidden || sel.has(c.id))).map(s => '<button type="button" class="chip sub" data-pcat="' + esc(s.id) + '" aria-pressed="' + sel.has(s.id) + '">' + esc(s.name) + '</button>').join('') + '</div>').join('');
  const h = '<div class="sheet-h"><b id="sheet-title">' + (IF.id ? esc(IF.name) : 'Nuevo rubro') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="pitemf" novalidate>' +
    '<div class="field"><label class="label" for="i-name">Nombre</label><input class="inp" id="i-name" value="' + esc(IF.name) + '" placeholder="Ej. Mercado, Ahorro moto" autocomplete="off"></div>' +
    '<div class="field"><label class="label" for="i-amt">Valor mensual</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="i-amt" inputmode="numeric" class="num" value="' + (IF.amount ? nf.format(IF.amount) : '') + '" placeholder="0" style="font-size:28px"></div></div>' +
    '<div class="field"><span class="label">Clasificación</span><div class="chips">' + CLS.map(([k]) => '<button type="button" class="chip" data-pcls="' + k + '" aria-pressed="' + (IF.cls === k) + '">' + k + '</button>').join('') + '</div></div>' +
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
  if (d.pkind && IF) { IF._g = d.pkind === 'g'; document.querySelectorAll('[data-pkind]').forEach(b => b.setAttribute('aria-pressed', b === el)); $('#i-cats').hidden = !IF._g; $('#i-acc-l').textContent = IF._g ? 'Dónde vive esta plata' : 'Cuenta de ahorro'; return; }
  if (d.pcat && IF) { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'); return; }
  if (el.id === 'i-del' && IF && PF) { if (!IF._arm) { IF._arm = true; el.textContent = 'Toca otra vez para eliminar'; el.className = 'btn danger block'; return; }
    PF.items = PF.items.filter(i => i.id !== IF.id); save(); const pl = PF; IF = null; render(); toast('Rubro eliminado'); return planSheet(pl); }
  if (el.id === 'p-del' && PF) { if (!PF._arm) { PF._arm = true; el.textContent = 'Toca otra vez para eliminar la versión'; el.className = 'btn danger block'; return; }
    S.plans = S.plans.filter(x => x.id !== PF.id); save(); closeSheet(); render(); return toast('Versión eliminada'); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'pitemf') return; e.preventDefault();
  const err = readItem(); if (err) { $('#i-err').textContent = err; return; }
  const it = { id:IF.id || uid(), name:IF.name, amount:IF.amount, cls:IF.cls, cats:IF.cats, acc:IF.acc };
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
