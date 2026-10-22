/* Vistas: render general, filas de movimientos e Inicio (celular y tablero de computador). */
function render(){
  if (billsAutoMatch()) setTimeout(save, 0);
  eyeSync();
  const p = period(ui.offset);
  $('#plabel').textContent = pLabel(p);
  document.querySelectorAll('button[data-v]').forEach(b => b.dataset.v === ui.view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $('#pnav').style.visibility = (ui.view === 'cuentas' || ui.view === 'ajustes') ? 'hidden' : 'visible';
  if (ui.view === 'explorar' && window.innerWidth < 1024) ui.view = 'analisis';
  const v = { inicio:vInicio, analisis:vAnalisis, plan:vPlan, explorar:vExplorar, cuentas:vCuentas, ajustes:vAjustes }[ui.view];
  tipHide();
  $('#main').innerHTML = '<div class="view v-' + ui.view + (ui.view === 'explorar' ? ' wide' : '') + ((ui.view === 'inicio' || ui.view === 'plan') && isDesk() ? ' dashv' : '') + '">' + v(p) + '</div>';
  cloudIcon();
  { const ss = document.getElementById('sidesync'); if (ss) { ss.textContent = syncText(); ss.dataset.st = syncState; } }
  if (ui.view === 'ajustes' && ui.setFocus) { const i = document.getElementById('setq'); if (i) { i.focus(); const n = i.value.length; try { i.setSelectionRange(n, n); } catch (_) {} } }
  const pt = document.getElementById('ptitle'); if (pt) pt.textContent = { inicio:'Inicio', analisis:'Análisis', plan:'Plan', explorar:'Explorar', cuentas:'Cuentas', ajustes:'Ajustes' }[ui.view] || '';
}

function txRow(t){
  let icon, title, sub, amt, cls = '';
  const a = accById(t.accountId);
  if (t.type === 'transferencia') {
    const b = accById(t.toAccountId);
    icon = '<div class="ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7h12l-3-3M17 17H5l3 3"/></svg></div>';
    title = 'Transferencia'; sub = (a ? a.name : '?') + ' → ' + (b ? b.name : '?'); amt = money(t.amount); cls = 'muted';
  } else if (t.type === 'ajuste') {
    icon = '<div class="ico">±</div>'; title = t.src === 'cuadre' ? 'Cuadre de cuenta' : 'Ajuste de saldo'; sub = a ? a.name : ''; amt = money(t.amount, true); cls = 'muted';
  } else {
    const c = cat(t.categoryId), pc = parentOf(c);
    icon = '<div class="ico">' + esc((c && c.emoji) || (pc && pc.emoji) || '•') + '</div>';
    title = c ? (c.parentId && pc ? pc.name + ' · ' + c.name : c.name) : 'Sin categoría';
    sub = (a ? a.name : '') + (t.fund ? ' · se paga con ' + accShort(t.fund) : '');
    amt = t.type === 'ingreso' ? money(t.amount, true) : money(-t.amount); cls = t.type === 'ingreso' ? 'pos' : '';
  }
  const note = t.note && t.type !== 'ajuste' ? t.note : '';
  return '<button class="row" data-tx="' + esc(t.id) + '">' + icon + '<div class="rmain"><b>' + esc(note || title) + (t.pending ? '<em class="tagp">' + (t.type === 'transferencia' ? 'por mover' : 'por confirmar') + '</em>' : '') + (t.grp ? '<em class="tagd">÷ dividido</em>' : '') + '</b><span>' + esc(note ? title : sub) + '</span></div><div class="ramt num"><span class="' + cls + '">' + amt + '</span>' + (note && sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></button>';
}


/* accesos rápidos de la tarjeta principal: un toque para registrar cada tipo de movimiento */
const accesos = () => '<div class="qa">' + ['gasto', 'ingreso', 'transferencia'].map(k => '<button type="button" data-add="' + k + '"><span class="qa-i">' + tipoIcono(k, 20) + '</span>' + TIPOS[k].corto + '</button>').join('') + '</div>';
function vInicio(p){
  const { inc, exp } = totals(p);
  const today = iso(new Date());
  const isCurrent = today >= p.s && today <= p.e;
  const budget = expenseBudgetTotal(p);
  const N = daysIn(p), ti = todayIdx(p);
  const head = '<div class="hello"><h1>Hola, <em>' + esc(userName()) + '</em></h1><p>Así va tu dinero del ' + fmtShort(p.start) + ' al ' + fmtShort(p.end) + '</p></div>';
  let out = '';
  const demo = !S.demo ? '' : '<div class="banner"><span><b>Datos de ejemplo.</b> Tus categorías y cuentas con movimientos ficticios.</span><button class="btn sm" data-go="ajustes" data-sec="datos">Importar mi respaldo</button></div>';
  const saleW = inc ? Math.min(100, exp / inc * 100) : (exp ? 100 : 0);
  const rate = inc ? Math.round((inc - exp) / inc * 100) : null;
  out += semanalCard() + inboxCard() + pendingCard() + movesCard() + (iaBanner() || sobranteCard() || backupReminder() || cuadreReminder() || aiNudges());
  const notices = out; out = '';
  const bexp = budget > 0 ? dailyExp(p, true).reduce((a, v) => a + v, 0) : exp, outPlan = exp - bexp;
  const flow = '<div class="stats3"><div><span><i style="background:var(--in)"></i>Entra</span><b class="num">' + money(inc) + '</b></div><div><span><i style="background:var(--out)"></i>Sale</span><b class="num">' + money(exp) + '</b></div>' +
    '<div><span>Ahorro</span><b class="num">' + (rate !== null ? rate + '%' : '—') + '</b></div></div>';
  if (budget > 0 && isCurrent) {
    /* lo primero: cuánto queda para gastar, y por día solo lo que se gasta poco a poco */
    const pl = planFor(p), R = pl ? planReal(pl, p) : null, left = pl ? planQueda(pl, p, R) : budget - bexp, daysLeft = N - ti, usedW = Math.min(100, bexp / budget * 100);
    const fx = !pl ? [] : pl.items.filter(i => isFijo(i) && !fijoPaid(R.r[i.id] || 0, itemBudget(pl, i, p))).map(i => ({ i, f:Math.max(0, itemBudget(pl, i, p) - (R.r[i.id] || 0)) })).filter(x => x.f > 0);
    const fijoLeft = fx.reduce((a, x) => a + x.f, 0), varLeft = left - fijoLeft;
    out += '<section class="card glow hero"><div class="card-h"><span class="label">Te queda para gastar</span><span class="pill">Día ' + (ti + 1) + ' de ' + N + '</span></div>' +
      '<div class="big num ' + (left < 0 ? 'neg' : '') + '">' + (left < 0 ? '<small>−</small>' : '') + '<small>$</small>' + nf.format(Math.abs(left)) + '</div>' +
      '<p class="hero-sub num">' + (varLeft > 0 ? '<b>' + money(varLeft / daysLeft) + '</b> por día · ' + daysLeft + (daysLeft === 1 ? ' día' : ' días') : '<b class="neg">Sin margen para el día a día</b>') + '</p>' +
      '<div class="flowbar" aria-hidden="true"><i style="width:' + usedW.toFixed(1) + '%;background:var(--out)"></i><i style="flex:1;background:var(--track)"></i></div>' +
      (fijoLeft > 0 ? '<p class="note" style="padding:0;margin:10px 0 0">Incluye ' + money(fijoLeft) + ' de pagos fijos por hacer (' + esc(fx.map(x => x.i.name).join(', ')) + ').</p>' : '') +
      (R && (R.out > 0 || R.fromSaved > 0) ? '<p class="note" style="padding:0;margin:4px 0 0">' + (R.out > 0 ? 'Fuera del plan: <b class="warn">' + money(R.out) + '</b>' : '') + (R.out > 0 && R.fromSaved > 0 ? ' · ' : '') + (R.fromSaved > 0 ? 'pagado con tus ahorros: ' + money(R.fromSaved) : '') + '</p>' : '') + accesos() + '</section>';
  } else {
    out += '<section class="card glow hero"><div class="card-h"><span class="label">Sin gastar este periodo</span><span class="pill">' + (isCurrent ? 'Día ' + (ti + 1) + ' de ' + N : 'Cerrado') + '</span></div>' +
      '<div class="big num">' + (inc - exp < 0 ? '<small>−</small>' : '') + '<small>$</small>' + nf.format(Math.abs(inc - exp)) + '</div>' +
      '<div class="flowbar" aria-hidden="true"><i style="width:' + saleW.toFixed(1) + '%;background:var(--out)"></i><i style="flex:1;background:var(--in)"></i></div>' + flow + accesos() + '</section>';
  }
  const hero = out; out = '';
  const bud = budCard(p), ases = asesorCard(p), bills = billsCard(true) + upcomingCard();

  const b = balances(), top = S.accounts.filter(a => !a.hidden && !esDeuda(a)).sort((x, y) => (b[y.id] || 0) - (b[x.id] || 0)).slice(0, 4);
  let accs = '';
  if (top.length) accs = '<section class="card"><div class="card-h"><h2>Tus cuentas</h2><button class="pill" data-go="cuentas">Ver todas</button></div><div class="minis">' +
    top.map(a => { const mv = S.transactions.filter(t => inP(t, p)).reduce((s, t) => s + (t.accountId === a.id ? (t.type === 'ingreso' || t.type === 'ajuste' ? t.amount : -t.amount) : 0) + (t.toAccountId === a.id ? t.amount : 0), 0);
      return '<button class="mini" data-accsheet="' + esc(a.id) + '"><b class="num">' + money(b[a.id] || 0) + '</b><span class="sub num ' + (mv > 0 ? 'pos' : mv < 0 ? 'neg' : '') + '">' + (mv ? money(mv, true) + ' este periodo' : 'Sin movimiento') + '</span><span class="nm">' + esc(a.name) + '</span><span class="sub">' + esc(a.group) + '</span></button>'; }).join('') + '</div></section>';

  let txs = S.transactions.filter(t => inP(t, p) && !hiddenTx(t));
  const f = ui.txf || 'todos';
  if (isDesk()) return vInicioDesk(p, { head, demo, notices, hero, bud, ases, bills, accs, txs, inc, exp });
  out += '<section class="card" id="movs"><div class="card-h"><h2>Movimientos</h2><span class="aside">' + txs.length + ' en el periodo</span></div>' +
    '<div class="pills">' + [['todos','Todos'],['gasto','Gastos'],['ingreso','Ingresos'],['transferencia','Transferencias']].map(([k, l]) => '<button class="pill" data-txf="' + k + '" aria-pressed="' + (f === k) + '">' + l + '</button>').join('') + '</div>';
  if (f !== 'todos') txs = txs.filter(t => t.type === f);
  if (ui.accFilter) { const a = accById(ui.accFilter); txs = txs.filter(t => t.accountId === ui.accFilter || t.toAccountId === ui.accFilter);
    out += '<div class="filter">Solo ' + esc(a ? a.name : 'cuenta') + '<button data-clearf aria-label="Quitar filtro">✕</button></div>'; }
  const totalTx = txs.length, cut = !ui.allTx && totalTx > 10;
  if (cut) txs = txs.slice(0, 10);
  if (!txs.length) out += '<div class="empty"><span>No hay movimientos aquí.</span><button class="btn sm ghost" data-add>Registrar uno</button></div>';
  const days = {};
  for (const t of txs) (days[t.date] = days[t.date] || []).push(t);
  out += '<div>';
  for (const d of Object.keys(days).sort().reverse()) {
    const list = days[d]; const dt = parseISO(d);
    const net = list.reduce((a, t) => a + (t.type === 'gasto' ? -t.amount : t.type === 'ingreso' ? t.amount : 0), 0);
    const lbl = (d === today ? 'Hoy, ' : DIAL[dt.getDay()] + ' ') + dt.getDate() + ' de ' + MESL[dt.getMonth()];
    out += '<section class="day"><div class="dayh"><span class="d">' + lbl + '</span><span class="n num">' + (net ? money(net, true) : '') + '</span></div>' + list.map(txRow).join('') + '</section>';
  }
  out += '</div>';
  if (cut) out += '<button class="btn ghost block" data-alltx>Ver los ' + totalTx + ' movimientos</button>';
  else if (ui.allTx && totalTx > 10) out += '<button class="btn ghost block" data-alltx>Mostrar menos</button>';
  return head + demo + smartPill() + notices + hero + bud + ases + bills + accs + out + '</section>';
}

/* ---------- computador: Inicio como tablero ----------
   Mismas piezas que el celular, organizadas para pantalla ancha: indicadores arriba,
   movimientos en tabla a la izquierda y el resumen del mes a la derecha. */
const DESK_MQ = window.matchMedia('(min-width:1024px)');
const isDesk = () => DESK_MQ.matches;
function vInicioDesk(p, x){
  const b = balances(), disp = dispTotal(b);
  const pp = period(ui.offset - 1), pt = totals(pp), ti = todayIdx(p), N = daysIn(p);
  /* comparación justa: el periodo anterior hasta el mismo día */
  const prevTo = iso(new Date(pp.start.getTime() + Math.max(0, ti) * 864e5));
  const pExp = S.transactions.filter(t => t.type === 'gasto' && t.date >= pp.s && t.date <= prevTo).reduce((a, t) => a + t.amount, 0);
  const rate = x.inc ? Math.round((x.inc - x.exp) / x.inc * 100) : null;
  const dExp = pExp ? Math.round((x.exp - pExp) / pExp * 100) : null;
  const kpi = (lbl, val, sub, cls) => '<div class="kpi"><span class="label">' + lbl + '</span><b class="num ' + (cls || '') + '">' + val + '</b><small>' + sub + '</small></div>';
  const kpis = kpi('Entró', money(x.inc), pt.inc ? 'Periodo anterior: ' + money(pt.inc) : 'En este periodo') +
    kpi('Salió', money(x.exp), dExp === null ? 'Día ' + (ti + 1) + ' de ' + N : '<span class="' + (dExp > 0 ? 'neg' : 'pos') + '">' + (dExp > 0 ? '↑ ' : '↓ ') + Math.abs(dExp) + '%</span> vs. el periodo anterior a hoy') +
    kpi('Te quedó', money(x.inc - x.exp), rate !== null ? rate + '% de lo que entró' : 'Sin ingresos registrados', x.inc - x.exp < 0 ? 'neg' : '') +
    kpi('Disponible', money(disp), S.accounts.filter(a => !a.hidden && !esDeuda(a)).length + ' cuentas · <button class="lnk" data-go="cuentas">ver</button>');
  return '<div class="dash">' +
    '<div class="dhead">' + x.head + smartPill() + '</div>' +
    '<div class="kpis">' + kpis + '</div>' +
    (x.demo || x.notices ? '<div class="dnotes">' + x.demo + x.notices + '</div>' : '') +
    '<div class="dmain">' + movsDesk(p, x.txs) + '</div>' +
    '<aside class="dside">' + x.hero + x.bills + x.bud + x.accs + x.ases + '</aside></div>';
}
function txCells(t){
  const a = accById(t.accountId), nm = id => { const z = accById(id); return z ? accShort(z.id) : '?'; };
  if (t.type === 'transferencia') return { ico:'⇄', desc:t.note || 'Transferencia', cat:'Transferencia', acc:nm(t.accountId) + ' → ' + nm(t.toAccountId), amt:money(t.amount), cls:'muted' };
  if (t.type === 'ajuste') return { ico:'±', desc:t.src === 'cuadre' ? 'Cuadre de cuenta' : 'Ajuste de saldo', cat:'Ajuste', acc:a ? accShort(a.id) : '', amt:money(t.amount, true), cls:'muted' };
  const c = cat(t.categoryId), pc = parentOf(c);
  return { ico:(c && c.emoji) || (pc && pc.emoji) || '•', desc:t.note || (c ? c.name : 'Sin categoría'), cat:c ? (c.parentId && pc ? pc.name + ' › ' + c.name : c.name) : 'Sin categoría',
    acc:(a ? accShort(a.id) : '') + (t.fund ? ' · con ' + accShort(t.fund) : ''), amt:t.type === 'ingreso' ? money(t.amount, true) : money(-t.amount), cls:t.type === 'ingreso' ? 'pos' : '' };
}
function txTRow(t, day){
  const x = txCells(t);
  return '<button class="trow' + (day ? ' newday' : '') + '" data-tx="' + esc(t.id) + '"><span class="tday">' + esc(day || '') + '</span><span class="td1"><span class="ico sm">' + esc(x.ico) + '</span><span class="tdesc">' + esc(x.desc) +
    (t.pending ? '<em class="tagp">' + (t.type === 'transferencia' ? 'por mover' : 'por confirmar') + '</em>' : '') + (t.grp ? '<em class="tagd">÷ dividido</em>' : '') + '</span></span>' +
    '<span class="tc">' + esc(x.cat) + '</span><span class="tc">' + esc(x.acc) + '</span><span class="tv num ' + x.cls + '">' + x.amt + '</span></button>';
}
function txMatch(t, q){
  if (!q) return true; const x = txCells(t), d = q.replace(/[.$\s]/g, '');
  return (x.desc + ' ' + x.cat + ' ' + x.acc).toLowerCase().includes(q) || (/^\d+$/.test(d) && String(t.amount).includes(d));
}
function movsBody(p, txs){
  const q = (ui.txq || '').trim().toLowerCase(), today = iso(new Date());
  let list = txs.filter(t => txMatch(t, q));
  const total = list.length, lim = ui.allTx ? 1e9 : 25; list = list.slice(0, lim);
  if (!list.length) return '<div class="empty"><span>' + (q ? 'Nada coincide con "' + esc(q) + '".' : 'No hay movimientos aquí.') + '</span>' + (q ? '' : '<button class="btn sm ghost" data-add>Registrar uno</button>') + '</div>';
  let h = '', last = '';
  for (const t of list) { const dt = parseISO(t.date), lbl = t.date === today ? 'Hoy' : DIAL[dt.getDay()].slice(0, 3) + ' ' + dt.getDate() + ' ' + MES[dt.getMonth()];
    h += txTRow(t, t.date === last ? '' : lbl); last = t.date; }
  if (total > lim) h += '<button class="btn ghost block" data-alltx style="margin-top:12px">Ver los ' + total + ' movimientos</button>';
  return h;
}
function movsDesk(p, txs){
  const f = ui.txf || 'todos';
  if (f !== 'todos') txs = txs.filter(t => t.type === f);
  let filt = '';
  if (ui.accFilter) { const a = accById(ui.accFilter); txs = txs.filter(t => t.accountId === ui.accFilter || t.toAccountId === ui.accFilter);
    filt = '<div class="filter">Solo ' + esc(a ? a.name : 'cuenta') + '<button data-clearf aria-label="Quitar filtro">✕</button></div>'; }
  MV = { p, txs };
  return '<section class="card mcard" id="movs"><div class="card-h"><h2>Movimientos</h2><span class="aside">' + txs.length + ' en el periodo</span></div>' +
    '<div class="mtools"><div class="pills">' + [['todos','Todos'],['gasto','Gastos'],['ingreso','Ingresos'],['transferencia','Transferencias']].map(([k, l]) => '<button class="pill" data-txf="' + k + '" aria-pressed="' + (f === k) + '">' + l + '</button>').join('') + '</div>' +
    '<label class="msearch"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="txq" placeholder="Buscar nota, categoría, cuenta o valor" autocomplete="off" value="' + esc(ui.txq || '') + '"></label></div>' + filt +
    '<div class="mt-h"><span>Fecha</span><span>Descripción</span><span>Categoría</span><span>Cuenta</span><span style="text-align:right">Valor</span></div><div id="mtbody">' + movsBody(p, txs) + '</div></section>';
}
let MV = null;
document.addEventListener('input', e => { if (e.target.id !== 'txq' || !MV) return; ui.txq = e.target.value; const b = document.getElementById('mtbody'); if (b) b.innerHTML = movsBody(MV.p, MV.txs); });
DESK_MQ.addEventListener ? DESK_MQ.addEventListener('change', () => render()) : DESK_MQ.addListener(() => render());
window.addEventListener('scroll', () => document.body.classList.toggle('scrolled', window.scrollY > 40), { passive:true });
