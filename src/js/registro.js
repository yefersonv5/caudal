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
    if (t.grp) { const sib = S.transactions.filter(x => x.grp === t.grp && x.id !== t.id && x.type === 'gasto');
      F.grp = t.grp; F.parts = sib.map(x => ({ id:x.id, cat:x.categoryId || '', acc:x.accountId, amount:x.amount })); F.amount += sib.reduce((a, x) => a + x.amount, 0);
      const q = F.parts[0], pc = q ? q.amount / F.amount * 100 : 0;
      F.splitMode = F.parts.length === 1 && Math.abs(pc - Math.round(pc / 10) * 10) < 0.5 ? (q.acc === t.accountId ? 'cat' : q.cat === t.categoryId ? 'acc' : 'multi') : 'multi';
      if (F.splitMode !== 'multi') F.pct = Math.round(pc / 10) * 10; }
  } else F = { id:null, type:TIPOS[tipo] && tipo !== 'ajuste' ? tipo : 'gasto', amount:0, date:iso(new Date()), note:'', accountId:lastAccount(), toAccountId:null, parent:null, sub:null };
  F.catOpen = !F.parent; F.expand = null;
  drawForm(); setTimeout(() => { const i = $('#f-amt'); if (i && !t) i.focus(); }, 280);
}
function drawForm(){
  syncSplit();
  const types = ['gasto', 'ingreso', 'transferencia'].concat(F.type === 'ajuste' ? ['ajuste'] : []).map(k => [k, TIPOS[k].nombre]);
  const accs = S.accounts.filter(a => !a.hidden || a.id === F.accountId || a.id === F.toAccountId);
  const accChips = (key) => '<div class="cgrid">' + accs.map(a => '<button type="button" class="ctile sm" data-fa="' + key + '" data-id="' + esc(a.id) + '" aria-pressed="' + (F[key] === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div>';
    let h = '<div class="sheet-h"><b id="sheet-title" class="ttl"><span class="tbadge">' + tipoIcono(F.type) + '</span>' + (F.id ? TIPOS[F.type].editar : TIPOS[F.type].nuevo) + '</b>' + (F.id ? '' : '<button class="pill solid" id="go-smart" type="button" aria-label="Registrar con IA">✦ IA</button>') + '<button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="txf" novalidate>';
  h += '<div class="seg" role="group" aria-label="Tipo">' + types.map(([k, l]) => '<button type="button" data-ft="' + k + '" aria-pressed="' + (F.type === k) + '">' + l + '</button>').join('') + '</div>';
  h += freqChips();
  h += '<div class="amount"><span>' + (F.type === 'ajuste' ? (F.amount < 0 ? '−' : '+') : TIPOS[F.type].signo) + '$' + '</span><input id="f-amt" class="num" inputmode="numeric" autocomplete="off" placeholder="0" value="' + (F.amount ? nf.format(Math.abs(F.amount)) : '') + '" aria-label="Valor"></div><div class="err" id="f-err"></div>';
  if (F.type === 'gasto' || F.type === 'ingreso') {
    const g = F.type === 'gasto', m = g ? F.splitMode : null, tog = k => g && m !== 'multi' ? '<button type="button" class="xtog" data-xmode="' + k + '" aria-pressed="' + (m === k) + '">' + (m === k ? '✕ No dividir' : '÷ Dividir') + '</button>' : '';
    h += '<div class="field"><div class="lrow"><span class="label">Categoría</span>' + tog('cat') + '</div>' + catPicker();
    if (m === 'cat') { const q = F.parts[0], c = cat(q.cat); h += gridPicker('gasto', c ? (c.parentId || c.id) : null, c && c.parentId ? c.id : null, !!q._open || !q.cat, q._expand || null, 'x0') + splitBar(); }
    h += formBud();
    h += '</div><div class="field"><div class="lrow"><span class="label">Cuenta</span>' + tog('acc') + '</div>' + (m === 'acc' ? accChips2() + splitBar() : accChips('accountId')) + '</div>' + fundField();
    if (m === 'multi') h += splitField();
  } else if (F.type === 'transferencia') {
    h += '<div class="field"><span class="label">Desde</span>' + accChips('accountId') + '</div><div class="field"><span class="label">Hacia</span>' + accChips('toAccountId') + '</div>';
  } else {
    h += '<div class="field"><span class="label">Cuenta</span>' + accChips('accountId') + '</div><div class="seg" role="group" aria-label="Sentido del ajuste"><button type="button" data-sign="1" aria-pressed="' + (F.amount >= 0) + '">Sumar al saldo</button><button type="button" data-sign="-1" aria-pressed="' + (F.amount < 0) + '">Restar al saldo</button></div>';
  }
  h += '<div class="two"><div class="field"><label class="label" for="f-date">Fecha</label><input class="inp" type="date" id="f-date" value="' + F.date + '"></div><div class="field"><label class="label" for="f-note">Nota</label><input class="inp" id="f-note" autocomplete="off" placeholder="Opcional" value="' + esc(F.note) + '"></div></div>';
  if (F.type === 'gasto' || F.type === 'ingreso') h += '<button type="button" class="pill pendt" id="f-pend" aria-pressed="' + !!F.pending + '">' + (F.pending ? '◐ Valor aproximado: por confirmar' : '◐ ¿No recuerdas el valor exacto? Márcalo por confirmar') + '</button>';
  h += '<button class="btn accent block" type="submit">' + (F.id ? (F.pending ? 'Guardar' : 'Guardar cambios') : 'Registrar') + '</button>';
  if (F.id) h += '<button class="btn block ' + (ui.delArm ? 'danger' : 'ghost') + '" type="button" id="f-del">' + (ui.delArm ? 'Toca otra vez para eliminar' : (F.grp ? 'Eliminar el gasto completo' : 'Eliminar movimiento')) + '</button>';
  h += '</form>';
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
  return '<span>' + esc((c ? c.name : 'Sin categoría') + ' · ' + (F.accountId ? accShort(F.accountId) : 'sin cuenta')) + '</span><b class="' + (rest < 0 ? 'neg' : '') + '">' + (rest < 0 ? 'Te pasaste ' + money(-rest) : money(rest)) + '</b>';
}
/* división simple (dos partes): misma cuenta y dos categorías, o misma categoría y dos cuentas.
   F.pct es el porcentaje de la segunda parte; la primera se queda con el resto. */
function syncSplit(){
  if (!F || !F.splitMode || F.splitMode === 'multi' || !(F.parts || []).length) return;
  const q = F.parts[0]; q.amount = Math.round(Math.abs(F.amount) * (F.pct || 50) / 100);
  if (F.splitMode === 'cat') q.acc = F.accountId; else q.cat = F.sub || F.parent || '';
}
function splitNames(){
  const q = F.parts[0], nm = id => { const c = cat(id); return c ? c.name : '?'; };
  return F.splitMode === 'cat' ? [nm(F.sub || F.parent), q.cat ? nm(q.cat) : 'Segunda categoría'] : [F.accountId ? accShort(F.accountId) : '?', q.acc ? accShort(q.acc) : 'Otra cuenta'];
}
function splitBarTxt(){
  syncSplit(); const [a, b] = splitNames(), pct = F.pct || 50, tot = Math.abs(F.amount), q = F.parts[0];
  return '<div class="xl"><b>' + esc(a) + ' ' + (100 - pct) + '%</b><b>' + pct + '% ' + esc(b) + '</b></div><div class="xl"><span>' + (tot ? money(tot - q.amount) : '$ 0') + '</span><span>' + (tot ? money(q.amount) : '$ 0') + '</span></div>';
}
function splitBar(){
  return '<div class="xbar"><div id="xbtxt">' + splitBarTxt() + '</div><input type="range" min="10" max="90" step="10" value="' + (100 - (F.pct || 50)) + '" data-xrange aria-label="Reparto entre las dos partes"><button type="button" class="xmore" data-xmulti>Más partes o valores exactos</button></div>';
}
function accChips2(){
  const q = F.parts[0], accs = S.accounts.filter(a => !a.hidden || a.id === F.accountId || a.id === q.acc);
  return '<div class="cgrid">' + accs.map(a => '<button type="button" class="ctile sm" data-xacc2="' + esc(a.id) + '" aria-pressed="' + (F.accountId === a.id || q.acc === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div>';
}
function splitField(){
  if (!(F.parts || []).length) return '';
  const accOpts = sel => S.accounts.filter(a => !a.hidden || a.id === sel).map(a => '<option value="' + esc(a.id) + '"' + (sel === a.id ? ' selected' : '') + '>' + esc(accShort(a.id)) + '</option>').join('');
  return '<div class="field split"><span class="label">Dividido en</span><div class="smain" id="f-rest">' + splitMainTxt() + '</div>' +
    F.parts.map((p, i) => { const c = cat(p.cat);
      return '<div class="prow"><div class="pcat">' + gridPicker('gasto', c ? (c.parentId || c.id) : null, c && c.parentId ? c.id : null, !!p._open || !p.cat, p._expand || null, 'x' + i) + '</div>' +
      '<select data-xacc="' + i + '" aria-label="Cuenta de la parte ' + (i + 2) + '">' + accOpts(p.acc) + '</select><input class="num" inputmode="numeric" autocomplete="off" placeholder="$ 0" data-xamt="' + i + '" value="' + (p.amount ? nf.format(p.amount) : '') + '" aria-label="Valor de la parte ' + (i + 2) + '">' +
      '<button type="button" class="pdel" data-xdel="' + i + '">Quitar</button>' +
      '<div class="ppct" role="group" aria-label="Porcentaje del total">' + [10, 20, 30, 40, 50, 60, 70, 80, 90].map(n => '<button type="button" data-xpct="' + i + ':' + n + '" aria-pressed="' + (p.pct === n) + '">' + n + '%</button>').join('') + '</div></div>'; }).join('') +
    '<button type="button" class="pill" data-xadd style="align-self:flex-start">+ Otra parte</button></div>';
}
function readAmt(){ return leerPesos($('#f-amt').value); }
function syncForm(){ const a = $('#f-amt'); if (!a) return; const v = readAmt(); F.amount = F.type === 'ajuste' && F.amount < 0 ? -v : v; F.date = $('#f-date').value || F.date; F.note = $('#f-note').value; }
function submitForm(){
  syncForm();
  const err = m => { $('#f-err').textContent = m; };
  if (!F.amount) return err('Escribe el valor.');
  if ((F.type === 'gasto' || F.type === 'ingreso') && !F.parent) return err('Elige una categoría.');
  if (!F.accountId) return err('Elige una cuenta.');
  if (F.type === 'transferencia' && (!F.toAccountId || F.toAccountId === F.accountId)) return err('Elige una cuenta de destino distinta.');
  if (F.type === 'gasto' && F.splitMode === 'cat' && !(F.parts[0] || {}).cat) return err('Elige la segunda categoría o toca No dividir.');
  if (F.type === 'gasto' && F.splitMode === 'acc' && !(F.parts[0] || {}).acc) return err('Elige la segunda cuenta o toca No dividir.');
  if (F.type === 'gasto' && F.splitMode === 'cat' && (F.parts[0].cat === (F.sub || F.parent))) return err('Elige dos categorías distintas.');
  syncSplit();
  const parts = F.type === 'gasto' ? (F.parts || []) : [];
  if (parts.length) {
    if (parts.some(p => !p.amount)) return err('Escribe el valor de cada parte o quítala.');
    if (parts.some(p => !p.cat)) return err('Elige la categoría de cada parte.');
    if (Math.abs(F.amount) - partsSum() <= 0) return err('Las partes suman todo el gasto: deja algo para ' + ((cat(F.sub || F.parent) || {}).name || 'la categoría de arriba') + ' o quita una parte.');
  }
  const t = { id: F.id || uid(), type:F.type, amount: F.type === 'ajuste' ? F.amount : Math.abs(F.amount), date:F.date, ts:Date.now(), accountId:F.accountId, note:F.note.trim() };
  if (F.type === 'gasto' || F.type === 'ingreso') t.categoryId = F.sub || F.parent;
  if (F.type === 'transferencia') t.toAccountId = F.toAccountId;
  if (F.pending && (F.type === 'gasto' || F.type === 'ingreso')) t.pending = true;
  if (F.type === 'gasto' && F.fund && cardOf(F.accountId)) t.fund = F.fund;
  const grp = parts.length ? (F.grp || uid()) : null;
  if (grp) { t.grp = grp; t.amount = Math.abs(F.amount) - partsSum(); }
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
    const gone = new Set(S.transactions.filter(y => F.grp && y.grp === F.grp && !keep.has(y.id)).map(y => y.id));
    S.transactions = S.transactions.filter(y => !gone.has(y.id) && !(gone.has(y.auto) && y.pending && y.type === 'transferencia'));
  }
  S.lastAccount = F.accountId; sortTx(S); save();
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
