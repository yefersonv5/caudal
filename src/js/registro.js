/* Hoja de registro: nuevo o editar gasto, ingreso, transferencia o ajuste; gasto dividido. */
let F = null, LOCKY = 0;
function openSheet(html){
  $('#sheet').classList.remove('t-gasto', 't-ingreso', 't-transferencia', 't-ajuste');
  const sh = $('#sheet'), sc = $('#scrim');
  sh.className = 'sheet'; sh.innerHTML = '<div class="grab"></div>' + html; sh.hidden = false; sc.hidden = false; sh.scrollTop = 0;
  if (!document.body.classList.contains('lock')) { LOCKY = window.scrollY; document.body.style.top = -LOCKY + 'px'; document.body.classList.add('lock'); }
  requestAnimationFrame(() => { sh.classList.add('on'); sc.classList.add('on'); });
}
function closeSheet(){
  const sh = $('#sheet'), sc = $('#scrim');
  sh.classList.remove('on'); sc.classList.remove('on');
  setTimeout(() => { sh.hidden = true; sc.hidden = true; sh.innerHTML = ''; sh.className = 'sheet'; }, 260);
  if (document.body.classList.contains('lock')) { document.body.classList.remove('lock'); document.body.style.top = ''; window.scrollTo(0, LOCKY); }
  F = null; SM = null; BF = null; if (typeof MF !== 'undefined') MF = null; RF = null; PF = null; IF = null; CQ = null; CQ_RET = null; if (REC) { try { REC.stop(); } catch (_) {} REC = null; }
}
function lastAccount(){ return S.lastAccount && accById(S.lastAccount) ? S.lastAccount : (S.accounts.find(a => !a.hidden) || {}).id; }
function txForm(t, tipo){
  ui.delArm = false;
  if (t) { const c = cat(t.categoryId);
    F = { id:t.id, type:t.type, amount:t.amount, date:t.date, note:t.note || '', accountId:t.accountId, toAccountId:t.toAccountId || null,
      parent: c ? (c.parentId || c.id) : null, sub: c && c.parentId ? c.id : null, pending:!!t.pending, fund:t.fund || null };
    if (t.grp) { const all = S.transactions.filter(x => x.grp === t.grp && x.id !== t.id && x.type === 'gasto'), sib = excCargar(t, all);
      F.grp = t.grp; F.amount += all.filter(x => !sib.includes(x)).reduce((a, x) => a + x.amount, 0); F.parts = sib.map(x => ({ id:x.id, cat:x.categoryId || '', acc:x.accountId, amount:x.amount })); F.amount += sib.reduce((a, x) => a + x.amount, 0);
      F.splitMode = F.parts.length ? 'multi' : null;
      /* si las partes y la principal valen lo mismo (con diferencia de redondeo), sigue en partes iguales */
      const vs = F.parts.map(x => x.amount).concat(F.amount - partsSum()); F.igual = Math.max(...vs) - Math.min(...vs) <= vs.length; }
  } else F = { id:null, type:TIPOS[tipo] && tipo !== 'ajuste' ? tipo : 'gasto', amount:0, date:iso(new Date()), note:'', accountId:lastAccount(), toAccountId:null, parent:null, sub:null };
  F.catOpen = !F.parent; F.expand = null;
  drawForm(); setTimeout(() => { const i = $('#f-amt'); if (i && !t) i.focus(); }, 280);
}
function drawForm(){
  splitIgual();
  const types = ['gasto', 'ingreso', 'transferencia'].concat(F.type === 'ajuste' ? ['ajuste'] : []).map(k => [k, TIPOS[k].nombre]);
  const accs = S.accounts.filter(a => (!a.hidden && !esDeuda(a)) || a.id === F.accountId || a.id === F.toAccountId);
  const accChips = (key) => '<div class="cgrid">' + accs.filter(a => !esDeuda(a) || a.id === F[key]).map(a => '<button type="button" class="ctile sm" data-fa="' + key + '" data-id="' + esc(a.id) + '" aria-pressed="' + (F[key] === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div>';
    let h = '<div class="sheet-h"><b id="sheet-title" class="ttl"><span class="tbadge">' + tipoIcono(F.type) + '</span>' + (F.id ? TIPOS[F.type].editar : TIPOS[F.type].nuevo) + '</b>' + (F.id ? '' : '<button class="pill solid" id="go-smart" type="button" aria-label="Registrar con IA">✦ IA</button>') + '<button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="txf" novalidate>';
  /* pestañas de tipo con un indicador que se desliza; el resto del formulario es la "página" que se mueve con el dedo */
  h += '<div class="seg tabs" role="group" aria-label="Tipo" style="--n:' + types.length + ';--i:' + types.findIndex(([k]) => k === F.type) + '"><i class="seg-ind" aria-hidden="true"></i>' +
    types.map(([k, l]) => '<button type="button" data-ft="' + k + '" aria-pressed="' + (F.type === k) + '">' + l + '</button>').join('') + '</div><div class="fpage">';
  h += freqChips();
  h += '<div class="amount"><span>' + (F.type === 'ajuste' ? (F.amount < 0 ? '−' : '+') : TIPOS[F.type].signo) + '$' + '</span><input id="f-amt" class="num" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (F.amount ? nf.format(Math.abs(F.amount)) : '') + '" aria-label="Valor"></div><div class="err" id="f-err"></div>';
  if (F.type === 'gasto' || F.type === 'ingreso') {
    const g = F.type === 'gasto', m = g ? F.splitMode : null;
    const tog = g && !excMonto() ? '<button type="button" class="xtog" data-xmode aria-pressed="' + !!m + '">' + (m ? '✕ No dividir' : '÷ Dividir') + '</button>' : '';
    h += '<div class="field"><div class="lrow"><span class="label">Categoría</span>' + tog + '</div>' + catPicker();
    h += formBud();
    /* las partes van justo debajo de la categoría principal */
    if (m) h += '</div>' + splitField() + '<div>';
    const deu = g && esDeuda(accById(F.accountId));
    h += '</div><div class="field"><span class="label">Cuenta</span>' + (deu ? deudaNota() : accChips('accountId')) + (g ? deudaToggle() : '') + '</div>' + (deu ? '' : fundField() + excField());
  } else if (F.type === 'transferencia') {
    const deu = esDeuda(accById(F.toAccountId));
    h += '<div class="field"><span class="label">Desde</span>' + accChips('accountId') + '</div><div class="field"><span class="label">Hacia</span>' + (deu ? deudaNota() : accChips('toAccountId')) + deudaToggle() + '</div>' + (deu ? deudaRubro() : '');
  } else {
    h += '<div class="field"><span class="label">Cuenta</span>' + accChips('accountId') + '</div><div class="seg" role="group" aria-label="Sentido del ajuste"><button type="button" data-sign="1" aria-pressed="' + (F.amount >= 0) + '">Sumar al saldo</button><button type="button" data-sign="-1" aria-pressed="' + (F.amount < 0) + '">Restar al saldo</button></div>';
  }
  h += '<div class="two"><div class="field"><label class="label" for="f-date">Fecha</label><input class="inp" type="date" id="f-date" value="' + F.date + '"></div><div class="field"><label class="label" for="f-note">Nota</label><input class="inp" id="f-note" autocomplete="off" placeholder="Opcional" value="' + esc(F.note) + '"></div></div>';
  if (F.type === 'gasto' || F.type === 'ingreso') h += '<button type="button" class="pill pendt" id="f-pend" aria-pressed="' + !!F.pending + '">' + (F.pending ? '◐ Valor aproximado: por confirmar' : '◐ ¿No recuerdas el valor exacto? Márcalo por confirmar') + '</button>';
  h += '<button class="btn accent block" type="submit">' + (F.id ? (F.pending ? 'Guardar' : 'Guardar cambios') : 'Registrar') + '</button>';
  if (F.id) h += '<button class="btn block ' + (ui.delArm ? 'danger' : 'ghost') + '" type="button" id="f-del">' + (ui.delArm ? 'Toca otra vez para eliminar' : (F.grp ? 'Eliminar el gasto completo' : 'Eliminar movimiento')) + '</button>';
  h += '</div></form>';
  if ($('#sheet').hidden) openSheet(h); else { $('#sheet').innerHTML = '<div class="grab"></div>' + h; }
  { const cl = $('#sheet').classList; cl.remove('t-gasto', 't-ingreso', 't-transferencia', 't-ajuste'); cl.add('t-' + F.type); }
}
/* selector de categoría estilo cuadrícula: la principal abre sus subcategorías debajo de su fila.
   k: prefijo de los data-* ('f' en el formulario, 'rv' + índice en la revisión de IA) */
function gridPicker(type, parent, sub, open, expand, k){
  const at = (n, v) => 'data-' + n + '="' + esc(v) + '" data-k="' + k + '"';
  const pc = parent ? cat(parent) : null, sc = sub ? cat(sub) : null;
  if (pc && !open) return '<button type="button" class="csel" ' + at('gopen', '1') + '><span class="em">' + esc((sc && sc.emoji) || pc.emoji || '•') + '</span><b>' + esc(pc.name + (sc ? ' › ' + sc.name : '')) + '</b><span class="ch">Cambiar</span></button>';
  const parents = S.categories.filter(c => !c.parentId && c.type === type && (!c.hidden || c.id === parent));
  const subsOf = id => S.categories.filter(c => c.parentId === id && (!c.hidden || c.id === sub));
  const tile = (c, attrs, pressed, extra, chev) => '<button type="button" class="ctile" ' + attrs + ' aria-pressed="' + pressed + '"' + (extra || '') + '><span class="em">' + esc(c.emoji || '•') + '</span><span class="nm">' + esc(c.name) + '</span>' + (chev ? '<span class="chev">' + (expand === c.id ? '▲' : '▼') + '</span>' : '') + '</button>';
  const ix = parents.findIndex(c => c.id === expand), end = ix < 0 ? -1 : Math.min(parents.length - 1, ix - ix % 3 + 2);
  let h = '<div class="cgrid">';
  parents.forEach((c, i) => { const hs = subsOf(c.id).length > 0;
    h += tile(c, at('gp', c.id), parent === c.id && !hs, hs ? ' aria-expanded="' + (expand === c.id) + '"' : '', hs);
    if (i === end) { const p0 = parents[ix];
      h += '<div class="csubs">' + tile({ emoji:p0.emoji, name:'Solo ' + p0.name }, at('gsel', p0.id), parent === p0.id && !sub) +
        subsOf(p0.id).map(s => tile(s, at('gs', s.id), sub === s.id)).join('') + '</div>'; }
  });
  return h + '</div>';
}
function catPicker(){ return gridPicker(F.type, F.parent, F.sub, F.catOpen || !F.parent, F.expand, 'f'); }
/* aplica un toque de la cuadrícula a un estado { parent, sub, open, expand } */
function gridTap(st, d){
  if (d.gp) { if (S.categories.some(c => c.parentId === d.gp && !c.hidden)) { st.expand = st.expand === d.gp ? null : d.gp; return; } st.parent = d.gp; st.sub = null; st.open = false; st.expand = null; return; }
  if (d.gsel) { st.parent = d.gsel; st.sub = null; st.open = false; st.expand = null; return; }
  if (d.gs) { st.sub = d.gs; st.parent = (cat(d.gs) || {}).parentId || st.parent; st.open = false; st.expand = null; return; }
  if (d.gopen) { st.open = true; st.expand = st.parent; }
}
/* gasto dividido: la parte principal es la de arriba (categoría y cuenta elegidas) y se queda con lo que
   no asignes a las demás partes. Cada parte se guarda como un movimiento propio con el mismo grp. */
const partsSum = () => (F.parts || []).reduce((a, p) => a + (p.amount || 0), 0);
function splitMainTxt(){
  const c = cat(F.sub || F.parent), rest = Math.abs(F.amount) - partsSum();
  return '<span>1. ' + esc((c ? c.name : 'Elige la categoría arriba') + ' · ' + (F.accountId ? accShort(F.accountId) : 'sin cuenta')) + '</span><b class="' + (rest < 0 ? 'neg' : '') + '">' + (rest < 0 ? 'Te pasaste ' + money(-rest) : money(rest)) + '</b>';
}
/* Gasto dividido: la categoría principal más una o varias partes (cada una con su categoría, cuenta y valor).
   Por defecto el total se reparte en partes iguales y se recalcula al cambiar el valor o agregar partes;
   escribir el valor de una parte pasa a valores exactos, y la principal se queda con lo que falte. */
function splitIgual(){
  if (!F || !F.splitMode || !F.igual || !(F.parts || []).length) return;
  const each = Math.floor(Math.abs(F.amount) / (F.parts.length + 1));
  F.parts.forEach(p => p.amount = each);
}
function splitField(){
  if (!(F.parts || []).length) return '';
  const accOpts = sel => S.accounts.filter(a => (!a.hidden && !esDeuda(a)) || a.id === sel).map(a => '<option value="' + esc(a.id) + '"' + (sel === a.id ? ' selected' : '') + '>' + esc(accShort(a.id)) + '</option>').join('');
  return '<div class="field split"><div class="lrow"><span class="label">Dividido en ' + (F.parts.length + 1) + ' partes</span>' +
    '<div class="seg sm" role="group" aria-label="Cómo repartir"><button type="button" data-xigual="1" aria-pressed="' + !!F.igual + '">Iguales</button><button type="button" data-xigual="0" aria-pressed="' + !F.igual + '">Valores exactos</button></div></div>' +
    '<div class="smain" id="f-rest">' + splitMainTxt() + '</div>' +
    F.parts.map((p, i) => { const c = cat(p.cat);
      return '<div class="prow"><div class="pcat"><span class="pnum">' + (i + 2) + '.</span>' + gridPicker('gasto', c ? (c.parentId || c.id) : null, c && c.parentId ? c.id : null, !!p._open || !p.cat, p._expand || null, 'x' + i) + '</div>' +
      '<select data-xacc="' + i + '" aria-label="Cuenta de la parte ' + (i + 2) + '">' + accOpts(p.acc) + '</select><input class="num" inputmode="numeric" autocomplete="off" placeholder="$ 0" data-xamt="' + i + '" value="' + (p.amount ? nf.format(p.amount) : '') + '" aria-label="Valor de la parte ' + (i + 2) + '">' +
      '<button type="button" class="pdel" data-xdel="' + i + '" aria-label="Quitar la parte ' + (i + 2) + '">Quitar</button></div>'; }).join('') +
    '<button type="button" class="pill" data-xadd style="align-self:flex-start">+ Otra categoría</button></div>';
}
/* cambia el tipo del formulario conservando el valor escrito */
function cambiarTipo(tipo){
  syncForm(); if (F.type === tipo) return drawForm();
  F.type = tipo; if (tipo !== 'gasto') { F.parts = []; F.splitMode = null; } F.parent = null; F.sub = null; F.catOpen = true; F.expand = null;
  if (tipo !== 'ajuste') F.amount = Math.abs(F.amount);
  if (esDeuda(accById(F.accountId))) F.accountId = F.prevAcc || lastAccount();
  if (esDeuda(accById(F.toAccountId))) F.toAccountId = null;
  drawForm();
}
/* deslizar a los lados en la hoja de registro pasa entre Gasto, Ingreso y Transferencia como páginas.
   No arranca sobre campos de texto ni cuadrículas de categorías y cuentas, para no cambiar de página al elegir algo. */
(() => {
  const PAG = ['gasto', 'ingreso', 'transferencia'];
  let x0 = null, y0 = 0, dx = 0, on = false, t0 = 0;
  const pg = () => $('#txf .fpage'), ind = () => $('#txf .seg-ind');
  const idx = () => PAG.indexOf(F.type);
  document.addEventListener('touchstart', e => {
    x0 = null; const s = $('#sheet');
    if (!F || !pg() || idx() < 0 || e.touches.length > 1 || !s.contains(e.target)) return;
    if (e.target.closest('input,textarea,select,.cgrid,.csubs')) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; on = false; t0 = Date.now();
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (x0 === null) return; const t = e.touches[0]; dx = t.clientX - x0; const dy = t.clientY - y0;
    if (!on) { if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { x0 = null; return; } if (Math.abs(dx) > 12) { on = true; pg().style.transition = ind().style.transition = 'none'; } else return; }
    e.preventDefault();
    const i = idx(), borde = (dx > 0 && i === 0) || (dx < 0 && i === PAG.length - 1), w = pg().offsetWidth || window.innerWidth;
    const d = borde ? dx / 4 : dx; /* en la primera y la última página el gesto se resiste */
    pg().style.transform = 'translateX(' + d + 'px)'; pg().style.opacity = String(1 - Math.min(.5, Math.abs(d) / w));
    ind().parentNode.style.setProperty('--i', String(i - d / w));
  }, { passive:false });
  const end = () => {
    if (x0 === null) return; x0 = null; if (!on) return; on = false;
    const i = idx(), w = pg().offsetWidth || window.innerWidth, v = Math.abs(dx) / Math.max(1, Date.now() - t0);
    const j = (Math.abs(dx) > w * 0.25 || (v > 0.4 && Math.abs(dx) > 40)) ? i + (dx < 0 ? 1 : -1) : i;
    const p = pg(), n = ind(); p.style.transition = 'transform .16s ease-in, opacity .16s'; n.style.transition = '';
    if (j === i || j < 0 || j >= PAG.length) { p.style.transform = ''; p.style.opacity = ''; n.parentNode.style.setProperty('--i', String(i)); return; }
    n.parentNode.style.setProperty('--i', String(j));
    p.style.transform = 'translateX(' + (dx < 0 ? -w : w) * .6 + 'px)'; p.style.opacity = '0';
    setTimeout(() => {
      cambiarTipo(PAG[j]);
      const q = pg(); if (!q) return; /* la nueva página entra desde el lado contrario */
      q.style.transition = 'none'; q.style.transform = 'translateX(' + (dx < 0 ? w : -w) * .35 + 'px)'; q.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { q.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1), opacity .22s'; q.style.transform = ''; q.style.opacity = ''; }));
    }, 150);
  };
  document.addEventListener('touchend', end, { passive:true });
  document.addEventListener('touchcancel', end, { passive:true });
})();
function readAmt(){ return leerPesos($('#f-amt').value); }
function syncForm(){ const a = $('#f-amt'); if (!a) return; const v = readAmt(); F.amount = F.type === 'ajuste' && F.amount < 0 ? -v : v; F.date = $('#f-date').value || F.date; F.note = $('#f-note').value; }
function submitForm(){
  syncForm();
  const err = m => { $('#f-err').textContent = m; };
  if (!F.amount) return err('Escribe el valor.');
  if ((F.type === 'gasto' || F.type === 'ingreso') && !F.parent) return err('Elige una categoría.');
  if (!F.accountId) return err('Elige una cuenta.');
  if (F.type === 'transferencia' && (!F.toAccountId || F.toAccountId === F.accountId)) return err('Elige una cuenta de destino distinta.');
  splitIgual();
  const parts = F.type === 'gasto' ? (F.parts || []) : [];
  if (parts.length) {
    if (parts.some(p => !p.amount)) return err('Escribe el valor de cada parte o quítala.');
    if (parts.some(p => !p.cat)) return err('Elige la categoría de cada parte o quítala.');
    if (Math.abs(F.amount) - partsSum() <= 0) return err('Las partes suman todo el gasto: deja algo para ' + ((cat(F.sub || F.parent) || {}).name || 'la categoría de arriba') + ' o quita una parte.');
  }
  const t = { id: F.id || uid(), type:F.type, amount: F.type === 'ajuste' ? F.amount : Math.abs(F.amount), date:F.date, ts:Date.now(), accountId:F.accountId, note:F.note.trim() };
  if (F.type === 'gasto' || F.type === 'ingreso') t.categoryId = F.sub || F.parent;
  if (F.type === 'transferencia') { t.toAccountId = F.toAccountId; if (F.parent && esDeuda(accById(F.toAccountId))) t.categoryId = F.parent; }
  if (F.pending && (F.type === 'gasto' || F.type === 'ingreso')) t.pending = true;
  if (F.type === 'gasto' && F.fund && cardOf(F.accountId)) t.fund = F.fund;
  const exA = excMonto(), grp = parts.length || exA ? (F.grp || uid()) : null;
  if (grp) { t.grp = grp; t.amount = Math.abs(F.amount) - partsSum() - exA; }
  if (!F.id && !F.dupOk && S.transactions.some(x => x.type === t.type && x.amount === t.amount && x.date === t.date && x.accountId === t.accountId)) {
    F.dupOk = true; return err('Ya tienes un movimiento igual ese día en esta cuenta. Si es otro distinto, toca Guardar otra vez.'); }
  const i = S.transactions.findIndex(x => x.id === t.id);
  if (i >= 0) { const o = S.transactions[i]; t.ts = o.ts || t.ts; if (o.src) t.src = o.src; if (o.auto) t.auto = o.auto; if (o.pending && t.type === 'transferencia') t.pending = true; S.transactions[i] = t; } else S.transactions.push(t);
  syncFund(t);
  if (grp || F.grp) { /* partes del gasto dividido: crea, actualiza y borra las que quitaste */
    const keep = new Set([t.id]);
    for (const p of parts) { const x = { id:p.id || uid(), type:'gasto', amount:p.amount, date:t.date, ts:t.ts, accountId:p.acc, categoryId:p.cat, note:t.note, grp };
      if (t.pending) x.pending = true; keep.add(x.id);
      const j = S.transactions.findIndex(y => y.id === x.id); if (j >= 0) S.transactions[j] = x; else S.transactions.push(x); syncFund(x); }
    excGuardar(t, grp, keep);
    const gone = new Set(S.transactions.filter(y => F.grp && y.grp === F.grp && !keep.has(y.id)).map(y => y.id));
    S.transactions = S.transactions.filter(y => !gone.has(y.id) && !(gone.has(y.auto) && y.pending && y.type === 'transferencia'));
  }
  if (!esDeuda(accById(F.accountId))) S.lastAccount = F.accountId;
  sortTx(S); save();
  if (F.aseRec) aseMark(F.aseRec, 'hecha');
  const wasEdit = !!F.id, ret = CQ_RET; closeSheet();
  if (ret) { render(); setTimeout(ret, 300); return toast(wasEdit ? 'Cambios guardados' : 'Registrado'); }
  const p = period(ui.offset); if (!inP(t, p)) { for (let o = -24; o <= 1; o++) { if (inP(t, period(o))) { ui.offset = o; break; } } }
  render(); { const bm = budgetMsg(t); toast(bm || (wasEdit ? 'Cambios guardados' : 'Registrado'), bm ? 3400 : 2000); }
}

function accForm(){
  openSheet('<div class="sheet-h"><b id="sheet-title">Nueva cuenta</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="accf" novalidate>' +
    '<div class="field"><label class="label" for="a-name">Nombre</label><input class="inp" id="a-name" placeholder="Ej. Nequi" autocomplete="off"></div>' +
    '<div class="field"><label class="label" for="a-group">Grupo</label><input class="inp" id="a-group" list="grps" placeholder="Ej. Cuenta bancaria" autocomplete="off"><datalist id="grps">' + [...new Set(S.accounts.map(a => a.group))].map(g => '<option value="' + esc(g) + '">').join('') + '</datalist></div>' +
    '<div class="field"><label class="label" for="a-bal">Saldo actual</label><input class="inp num" id="a-bal" inputmode="numeric" placeholder="0"></div><div class="err" id="a-err"></div>' +
    '<button class="btn accent block" type="submit">Crear cuenta</button></form>');
}
function catForm(){
  const parents = S.categories.filter(c => !c.parentId && !c.hidden);
  openSheet('<div class="sheet-h"><b id="sheet-title">Nueva categoría</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="catf" novalidate>' +
    '<div class="two"><div class="field"><label class="label" for="c-emoji">Emoji</label><input class="inp" id="c-emoji" maxlength="4" placeholder="🍕"></div><div class="field"><label class="label" for="c-name">Nombre</label><input class="inp" id="c-name" autocomplete="off" placeholder="Ej. Domicilios"></div></div>' +
    '<div class="field"><label class="label" for="c-parent">Dentro de</label><select class="inp" id="c-parent"><option value="">Ninguna (categoría principal de gasto)</option><option value="__inc">Ninguna (categoría principal de ingreso)</option>' + parents.map(c => '<option value="' + esc(c.id) + '">' + esc(c.emoji + ' ' + c.name) + '</option>').join('') + '</select></div><div class="err" id="c-err"></div>' +
    '<button class="btn accent block" type="submit">Crear categoría</button></form>');
}
