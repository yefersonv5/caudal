/* Categorías: lista para consultarlas en Ajustes y hoja para crearlas o editarlas
   (emoji, nombre, dónde va, subcategorías, ocultar y eliminar cuando no se usan),
   con su lugar en el plan: presupuesto opcional al crearla y "Agregar al plan" al editarla. */

/* movimientos por categoría, contando solo la propia (sin subcategorías) */
function catUso(){
  const n = {};
  for (const t of S.transactions) if (t.categoryId) n[t.categoryId] = (n[t.categoryId] || 0) + 1;
  return n;
}
const catSubs = id => S.categories.filter(c => c.parentId === id);
const plural = (n, uno, varios) => nf.format(n) + ' ' + (n === 1 ? uno : varios);

/* categorías que Caudal reconoce por su nombre: si se renombran, deben conservar la palabra clave */
const CAT_CLAVE = [
  { es:c => c === salaryCat(), ok:n => /salari|sueldo|n[oó]mina/i.test(n), msg:'Caudal arranca el periodo con esta categoría. Si la renombras, conserva Salario, Sueldo o Nómina en el nombre.' },
  { es:c => c === servicios(), ok:n => norm(n) === 'servicios', msg:'Los recibos se apoyan en esta categoría por su nombre, así que se llama Servicios.' },
];
const catClave = c => CAT_CLAVE.find(k => k.es(c)) || null;

/* tarjeta de Ajustes: pestañas Gastos / Ingresos y una fila por categoría principal */
function catsAdminCard(){
  const tipo = ui.catTab || 'gasto', uso = catUso();
  const mains = t => S.categories.filter(c => !c.parentId && c.type === t);
  const activas = mains(tipo).filter(c => !c.hidden), ocultas = mains(tipo).filter(c => c.hidden);
  const fila = c => {
    const subs = catSubs(c.id), total = (uso[c.id] || 0) + subs.reduce((s, x) => s + (uso[x.id] || 0), 0);
    const det = subs.length ? subs.map(x => x.name + (x.hidden ? ' (oculta)' : '')).join(', ') : 'Sin subcategorías';
    return '<button class="brow" data-cated="' + esc(c.id) + '"><span class="ico">' + esc(c.emoji || '•') + '</span><span class="t"><b>' + esc(c.name) + '</b><span class="catdet">' + esc(det) + '</span></span><span class="r"><span class="bst">' + plural(total, 'mov.', 'mov.') + '</span></span>' + CHEV + '</button>';
  };
  const tab = (t, txt) => '<button type="button" data-cattab="' + t + '" aria-pressed="' + (tipo === t) + '">' + txt + ' · ' + mains(t).filter(c => !c.hidden).length + '</button>';
  return '<section class="card" id="set-cats"><div class="card-h"><h2>Categorías</h2><button class="pill" data-newcat>Nueva categoría</button></div>' +
    '<div class="seg sm cattabs" role="group" aria-label="Tipo de categoría">' + tab('gasto', 'Gastos') + tab('ingreso', 'Ingresos') + '</div>' +
    (activas.length ? '<div>' + activas.map(fila).join('') + '</div>' : '<p class="insight">Aún no tienes categorías de ' + (tipo === 'gasto' ? 'gasto' : 'ingreso') + '.</p>') +
    (ocultas.length ? '<details class="fold"><summary>Ocultas<span>' + ocultas.length + '</span></summary><div>' + ocultas.map(fila).join('') + '</div></details>' : '') +
    '<p class="note">Toca una categoría para cambiarle el nombre, el emoji o moverla. Los cambios se ven en todos tus movimientos.</p></section>';
}

/* hoja para crear (c = null) o editar una categoría; par preselecciona la principal al crear una subcategoría */
function catForm(c, par){
  const tipo = c ? c.type : par ? cat(par).type : (ui.catTab || 'gasto');
  const subs = c ? catSubs(c.id) : [], clave = c && catClave(c);
  const opt = (v, txt, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(txt) + '</option>';
  let dentro;
  if (!c) dentro = opt('', 'Ninguna (categoría principal de gasto)', !par && tipo === 'gasto') + opt('__inc', 'Ninguna (categoría principal de ingreso)', !par && tipo === 'ingreso') +
    S.categories.filter(x => !x.parentId && !x.hidden).map(x => opt(x.id, x.emoji + ' ' + x.name, x.id === par)).join('');
  else dentro = opt('', 'Ninguna (categoría principal)', !c.parentId) +
    S.categories.filter(x => !x.parentId && x.type === c.type && x.id !== c.id && (!x.hidden || x.id === c.parentId)).map(x => opt(x.id, x.emoji + ' ' + x.name, x.id === c.parentId)).join('');

  let h = '<div class="sheet-h"><b id="sheet-title">' + (c ? 'Editar categoría' : par ? 'Nueva subcategoría' : 'Nueva categoría') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div>' +
    '<form class="form" id="catf" data-id="' + esc(c ? c.id : '') + '" novalidate>' +
    '<div class="two"><div class="field"><label class="label" for="c-emoji">Emoji</label><input class="inp" id="c-emoji" maxlength="4" placeholder="🍕" value="' + esc(c ? c.emoji || '' : '') + '"></div>' +
    '<div class="field"><label class="label" for="c-name">Nombre</label><input class="inp" id="c-name" autocomplete="off" placeholder="Ej. Domicilios" value="' + esc(c ? c.name : '') + '"></div></div>' +
    (clave ? '<p class="note">' + esc(clave.msg) + '</p>' : '');

  if (subs.length) h += '<div class="field"><span class="label">Tipo</span><p class="insight">Categoría principal de ' + c.type + '. Como tiene subcategorías, se queda como principal.</p></div>';
  else h += '<div class="field"><label class="label" for="c-parent">Dentro de</label><select class="inp" id="c-parent">' + dentro + '</select></div>';
  /* al crear una categoría principal de gasto, de una vez su presupuesto en el plan (opcional) */
  if (!c && planFor(period(0))) h += '<div class="field" id="c-planf"' + (!par && tipo === 'gasto' ? '' : ' hidden') + '><label class="label" for="c-amt">¿Cuánto le asignas al mes? <span class="tile-s">opcional</span></label>' +
    '<input class="inp num" id="c-amt" inputmode="numeric" placeholder="$ 0" autocomplete="off"><div class="chips" style="margin-top:8px">' +
    ['Esenciales', 'No esenciales'].map(k => '<button type="button" class="chip" data-ccls="' + k + '" aria-pressed="' + (k === 'No esenciales') + '">' + k + '</button>').join('') +
    '</div><span class="tile-s">Si lo escribes, queda como rubro en tu plan y sus gastos se descuentan de ahí.</span></div>';
  h += '<div class="err" id="c-err"></div><button class="btn accent block" type="submit">' + (c ? 'Guardar cambios' : 'Crear categoría') + '</button></form>';

  if (c) {
    const uso = catUso(); h += '<div class="form catmas">' + catPlanBloque(c);
    if (!c.parentId) h += '<div class="field"><span class="label">Subcategorías</span><div>' +
      subs.map(x => '<button class="brow" data-cated="' + esc(x.id) + '"><span class="ico">' + esc(x.emoji || c.emoji || '•') + '</span><span class="t"><b>' + esc(x.name) + '</b><span>' + plural(uso[x.id] || 0, 'movimiento', 'movimientos') + '</span></span>' + (x.hidden ? '<span class="r"><span class="bst">Oculta</span></span>' : '') + CHEV + '</button>').join('') +
      '</div><button class="btn block ghost" data-newcat="' + esc(c.id) + '">+ Subcategoría</button></div>';
    const usos = catUsos(c), borrable = !usos.length;
    h += '<div class="field"><span class="label">' + (borrable ? 'Sin uso todavía' : 'Se usa en ' + usos.join(', ')) + '</span>' +
      '<button class="btn block ghost" data-cathide="' + esc(c.id) + '">' + (c.hidden ? 'Mostrar de nuevo' : 'Ocultar al registrar') + '</button>' +
      (borrable ? '<button class="btn block ghost" data-catdel="' + esc(c.id) + '">Eliminar</button>' : '<p class="note">Como ya se usa, no se puede eliminar. Ocúltala si no quieres verla al registrar; tu historial no cambia.</p>') + '</div>';
    if (c.parentId) h += '<button class="btn block ghost" data-cated="' + esc(c.parentId) + '">Volver a ' + esc(cat(c.parentId).name) + '</button>';
    h += '</div>';
  }
  if ($('#sheet').hidden) openSheet(h); else { $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#sheet').scrollTop = 0; }
}

/* en qué rubro del plan vigente cuenta la categoría, o el botón para agregarla */
function catPlanBloque(c){
  const pl = c.type === 'gasto' && planFor(period(0)); if (!pl) return '';
  const it = itemOfCat(pl, c.id);
  if (!it) return '<div class="field"><span class="label">En tu plan</span><p class="insight" style="margin:0 0 8px">No está en tu plan: lo que gastes aquí sale como Fuera del plan.</p><button class="btn block ghost" data-catplan="' + esc(c.id) + '">Agregar al plan</button></div>';
  const directo = (it.cats || []).includes(c.id);
  return '<div class="field"><span class="label">En tu plan</span><button class="brow" data-catrubro="' + esc(it.id) + '" data-catback="' + esc(c.id) + '"><span class="ico">' + esc(c.emoji || '•') + '</span><span class="t"><b>Rubro ' + esc(it.name) + '</b><span>' + money(it.amount) + ' al mes' + (directo ? '' : ' · cuenta por ' + esc(cat(c.parentId).name)) + '</span></span>' + CHEV + '</button></div>';
}

/* dónde se usa una categoría; si la lista queda vacía se puede eliminar sin dejar nada huérfano */
function catUsos(c){
  const n = catUso()[c.id] || 0, out = [];
  if (n) out.push(plural(n, 'movimiento', 'movimientos'));
  const subs = catSubs(c.id).length; if (subs) out.push(plural(subs, 'subcategoría', 'subcategorías'));
  if ((S.bills || []).some(b => b.categoryId === c.id) || (S.recurring || []).some(r => r.categoryId === c.id)) out.push('recibos o pagos fijos');
  if ((S.plans || []).some(p => (p.items || []).some(i => (i.cats || []).includes(c.id)))) out.push('tu Plan');
  return out;
}

/* refresca la página y, si la hoja sigue abierta en una categoría, también la hoja */
const catRefrescar = id => { save(); render(); if (id && cat(id)) catForm(cat(id)); else closeSheet(); };

document.addEventListener('click', e => {
  const el = e.target.closest('[data-cated],[data-cattab],[data-cathide],[data-catdel],[data-catplan],[data-catrubro],[data-ccls]'); if (!el) return;
  const d = el.dataset;
  if (d.ccls) { document.querySelectorAll('[data-ccls]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  /* abre el rubro del plan y, al guardarlo, vuelve a esta categoría */
  if (d.catplan) { const c = cat(d.catplan); PF = planFor(period(0)); if (c && PF) itemSheet(null, { name:c.name, cats:[c.id], back:c.id }); return; }
  if (d.catrubro) { PF = planFor(period(0)); const it = PF && PF.items.find(i => i.id === d.catrubro); if (it) { itemSheet(it); IF.back = d.catback; } return; }
  if (d.cattab) { ui.catTab = d.cattab; return render(); }
  if (d.cated) { const c = cat(d.cated); if (c) catForm(c); return; }
  if (d.cathide) { const c = cat(d.cathide); if (!c) return; c.hidden = !c.hidden; catRefrescar(c.id); return toast(c.hidden ? 'Categoría oculta' : 'Categoría visible de nuevo'); }
  if (d.catdel) { const c = cat(d.catdel); if (!c || catUsos(c).length) return;
    if (!el.classList.contains('danger')) { el.classList.add('danger'); el.classList.remove('ghost'); el.textContent = '¿Seguro? Toca para eliminar'; return; }
    S.categories = S.categories.filter(x => x.id !== c.id); delete S.budgets[c.id];
    const vuelta = c.parentId; catRefrescar(vuelta); return toast('Categoría eliminada'); }
});

/* el presupuesto opcional solo aplica a una categoría principal de gasto */
document.addEventListener('change', e => { if (e.target.id === 'c-parent' && $('#c-planf')) $('#c-planf').hidden = e.target.value !== ''; });
document.addEventListener('input', e => { if (e.target.id === 'c-amt') pesosCampo(e.target); });

document.addEventListener('submit', e => {
  if (e.target.id !== 'catf') return; e.preventDefault();
  const id = e.target.dataset.id, c = id ? cat(id) : null;
  const name = $('#c-name').value.trim(), emoji = $('#c-emoji').value.trim(), selP = $('#c-parent'), par = selP ? selP.value : null, err = $('#c-err');
  if (!name) { err.textContent = 'Escribe el nombre de la categoría.'; return; }
  const parent = par && par !== '__inc' ? cat(par) : null;
  const tipo = c ? c.type : parent ? parent.type : par === '__inc' ? 'ingreso' : 'gasto';
  const parentId = c && !selP ? c.parentId : parent ? parent.id : null;
  const dup = S.categories.find(x => x !== c && x.type === tipo && (x.parentId || null) === parentId && norm(x.name) === norm(name));
  if (dup) { err.textContent = 'Ya tienes una categoría con ese nombre ahí.'; return; }
  if (!c) {
    const nueva = { id:uid(), name, emoji: emoji || (parent ? parent.emoji : '•'), type:tipo, parentId, order:999, hidden:false };
    S.categories.push(nueva);
    if (parent) { catRefrescar(parent.id); return toast('Subcategoría creada'); }
    const monto = tipo === 'gasto' && $('#c-amt') ? leerPesos($('#c-amt').value) : 0, pl = monto && planFor(period(0));
    if (pl) { const cls = ($('[data-ccls][aria-pressed="true"]') || {}).dataset.ccls || 'No esenciales';
      pl.items.push({ id:uid(), name, amount:monto, cls, cats:[nueva.id], acc:pl.from }); }
    save(); closeSheet(); render(); return toast(pl ? 'Categoría creada y agregada a tu plan' : 'Categoría creada');
  }
  const clave = catClave(c); if (clave && !clave.ok(name)) { err.textContent = clave.msg; return; }
  c.name = name; c.emoji = emoji || (parent ? parent.emoji : '•'); c.parentId = parentId;
  catRefrescar(c.parentId); toast('Cambios guardados');
});
