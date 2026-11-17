/* Buscar movimientos en toda la historia (no solo el periodo): por persona, categoría, cuenta o lo que diga la nota.
   Escribiendo, busca en todo a la vez (sin mayúsculas ni tildes). Con un toque en una sugerencia queda fijo ese filtro
   (BQ.f = { k:'persona'|'cat'|'cuenta', v, txt }) y se pueden combinar texto y filtro. Muestra cuánto suman. */
let BQ = null;
const bqTexto = t => {
  const c = cat(t.categoryId), pc = c ? parentOf(c) : null;
  return normP([t.note, t.persona, t.de, c && c.name, pc && pc.name, accShort(t.accountId), t.toAccountId ? accShort(t.toAccountId) : '', TIPOS[t.type] ? TIPOS[t.type].corto : ''].filter(Boolean).join(' '));
};
function bqFiltro(t){
  const f = BQ.f; if (!f) return true;
  if (f.k === 'persona') return normP(t.persona) === f.v || normP(t.de) === f.v;
  if (f.k === 'cuenta') return t.accountId === f.v || t.toAccountId === f.v || subsDe(f.v).some(s => s.id === t.accountId || s.id === t.toAccountId);
  if (f.k === 'cat') return t.categoryId === f.v || catParentOf(t.categoryId) === f.v;
  return true;
}
function bqResultados(){
  const q = normP(BQ.q), palabras = q.split(' ').filter(Boolean), num = q.replace(/[.$\s]/g, '');
  return S.transactions.filter(t => !hiddenTx(t) && bqFiltro(t) && (!palabras.length || (() => { const x = bqTexto(t); return palabras.every(w => x.includes(w)); })() || (/^\d{3,}$/.test(num) && String(t.amount).includes(num))))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.ts || 0) - (a.ts || 0));
}
/* sugerencias según lo escrito: personas, categorías y cuentas que coinciden */
function bqSugerencias(){
  const q = normP(BQ.q), ok = n => !q || normP(n).includes(q), out = [];
  for (const p of personasLista()) if (p.key !== '_' && ok(p.nombre)) out.push({ k:'persona', v:p.key, txt:p.nombre, ico:'👤' });
  for (const c of S.categories.filter(c => !c.hidden && !c.parentId)) if (ok(c.name)) out.push({ k:'cat', v:c.id, txt:c.name, ico:c.emoji || '•' });
  for (const a of S.accounts.filter(a => !a.hidden)) if (ok(a.name)) out.push({ k:'cuenta', v:a.id, txt:accShort(a.id), ico:'🏦' });
  return out.filter(x => !BQ.f || x.k !== BQ.f.k).slice(0, q ? 8 : 12);
}
function buscarSheet(f){
  BQ = { q:'', f:f || null, lim:60 };
  openSheet('<div class="sheet-h"><b id="sheet-title">Buscar movimientos</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form bq">' +
    '<input class="inp" id="bq-q" type="search" autocomplete="off" placeholder="Persona, categoría, cuenta o nota" aria-label="Buscar">' +
    '<div id="bq-res"></div></div>');
  bqPintar(); if (!f) setTimeout(() => { const i = $('#bq-q'); if (i) i.focus(); }, 280);
}
function bqPintar(){
  const box = $('#bq-res'); if (!box || !BQ) return;
  const l = bqResultados(), sug = bqSugerencias(), hay = BQ.q.trim() || BQ.f;
  const suma = k => l.filter(t => t.type === k).reduce((s, t) => s + t.amount, 0);
  let h = (BQ.f ? '<div class="filter">' + { persona:'Persona', cat:'Categoría', cuenta:'Cuenta' }[BQ.f.k] + ': ' + esc(BQ.f.txt) + '<button data-bqx aria-label="Quitar filtro">✕</button></div>' : '') +
    (sug.length ? '<div class="chips nsug">' + sug.map((x, i) => '<button type="button" class="chip" data-bqs="' + i + '">' + esc(x.ico) + ' ' + esc(x.txt) + '</button>').join('') + '</div>' : '');
  if (!hay) { box.innerHTML = h + '<p class="note" style="padding:0">Escribe un nombre, una categoría, una cuenta o algo de la nota, o toca una sugerencia. Busca en todos tus movimientos, no solo en este periodo.</p>'; BQ.sug = sug; return; }
  h += '<section class="card" style="padding:14px 16px"><span class="label">' + l.length + (l.length === 1 ? ' movimiento' : ' movimientos') + '</span>' +
    '<div class="stats3" style="margin-top:8px"><div><span>Gastos</span><b class="num">' + money(suma('gasto')) + '</b></div><div><span>Ingresos</span><b class="num">' + money(suma('ingreso')) + '</b></div><div><span>Transferencias</span><b class="num">' + money(suma('transferencia')) + '</b></div></div></section>';
  h += l.length ? '<div>' + l.slice(0, BQ.lim).map(t => { const d = parseISO(t.date); return '<div class="bq-d">' + DIAL[d.getDay()].slice(0, 3) + ' ' + d.getDate() + ' ' + MES[d.getMonth()] + ' ' + d.getFullYear() + '</div>' + txRow(t); }).join('') + '</div>' +
    (l.length > BQ.lim ? '<button class="btn ghost block" data-bqmas>Ver más (' + (l.length - BQ.lim) + ')</button>' : '') : '<p class="note" style="padding:0">Nada coincide.</p>';
  box.innerHTML = h; BQ.sug = sug;
}
document.addEventListener('input', e => { if (e.target.id === 'bq-q' && BQ) { BQ.q = e.target.value; BQ.lim = 60; bqPintar(); } });
document.addEventListener('click', e => {
  const el = e.target.closest('[data-buscar],[data-bqs],[data-bqx],[data-bqmas]'); if (!el) return;
  e.stopPropagation(); const d = el.dataset;
  if (d.buscar !== undefined) { const [k, v] = (d.buscar || '').split(':'); const txt = k === 'persona' ? (personasLista().find(p => p.key === v) || {}).nombre : ''; return buscarSheet(k && v ? { k, v, txt:txt || v } : null); }
  if (!BQ) return;
  if (d.bqs !== undefined) { BQ.f = BQ.sug[+d.bqs]; BQ.q = ''; const i = $('#bq-q'); if (i) i.value = ''; return bqPintar(); }
  if (d.bqx !== undefined) { BQ.f = null; return bqPintar(); }
  if (d.bqmas !== undefined) { BQ.lim += 100; return bqPintar(); }
}, true);
