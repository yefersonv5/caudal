/* Detalles en hoja: una categoría, un día y el gesto de arrastrar la hoja para cerrarla. */
/* ---------- explorar una categoría (desde el mapa "En qué se va") ---------- */
let CS = null;
function catSheet(id, sub){
  const p = period(ui.offset); CS = { id, sub:sub || null };
  const m = spentByParent(p, 'gasto'), total = Object.values(m).reduce((a, x) => a + x.total, 0);
  if (id === '_rest') {
    const rows = Object.entries(m).sort((a, b) => b[1].total - a[1].total).slice(7);
    let h = '<div class="sheet-h"><b id="sheet-title">Otras categorías</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div>' +
      rows.map(([cid, x]) => { const c = cat(cid); return '<button class="acc" data-cs="' + esc(cid) + '"><span class="nm">' + esc((c ? c.emoji + ' ' + c.name : 'Sin categoría')) + '</span><span class="am num">' + money(x.total) + '</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>'; }).join('') + '</div></div>';
    tipHide(); return openSheet(h);
  }
  const c = cat(id), x = m[id] || { total:0, subs:{} };
  const inCat = t => { const tc = cat(t.categoryId), pc = parentOf(tc); return (pc ? pc.id : '_') === id; };
  const prevP = period(ui.offset - 1), prevT = S.transactions.filter(t => t.type === 'gasto' && inP(t, prevP) && inCat(t)).reduce((a, t) => a + t.amount, 0);
  let avg3 = 0, n3 = 0; for (let o = 1; o <= 3; o++) { const q = period(ui.offset - o); const v = S.transactions.filter(t => t.type === 'gasto' && inP(t, q) && inCat(t)).reduce((a, t) => a + t.amount, 0); if (S.transactions.some(t => inP(t, q))) { avg3 += v; n3++; } }
  avg3 = n3 ? avg3 / n3 : 0;
  const pl = planFor(p), it = pl ? itemOfCat(pl, id) : null;
  const dl = (a, b) => !b ? '' : Math.abs(a - b) / b < .05 ? '≈ igual' : (a > b ? '↑ ' : '↓ ') + Math.round(Math.abs(a - b) / b * 100) + '%';
  let h = '<div class="sheet-h"><b id="sheet-title">' + esc((c && c.emoji ? c.emoji + ' ' : '') + (c ? c.name : 'Sin categoría')) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">';
  h += '<section class="card glow" style="padding:16px"><span class="label">' + esc(pLabel(p)) + '</span><div class="tile-v num">' + money(x.total) + '</div>' +
    '<div class="stats3" style="margin-top:6px"><div><span>Del gasto total</span><b class="num">' + (total ? Math.round(x.total / total * 100) : 0) + '%</b></div>' +
    '<div><span>Periodo anterior</span><b class="num">' + money(prevT) + '</b><span class="' + (x.total > prevT ? 'neg' : 'pos') + '" style="font-size:11.5px">' + dl(x.total, prevT) + '</span></div>' +
    '<div><span>Promedio 3 meses</span><b class="num">' + money(avg3) + '</b><span class="' + (x.total > avg3 ? 'neg' : 'pos') + '" style="font-size:11.5px">' + dl(x.total, avg3) + '</span></div></div>';
  if (it) { const b = itemBudget(pl, it, p), s0 = planReal(pl, p).r[it.id], s = quietItem(it) ? Math.min(s0, b) : s0;
    h += '<div class="bullet" style="border-top:0;padding-bottom:0"><div class="catline"><span class="nm">Rubro del plan: ' + esc(it.name) + '</span><span class="am num ' + (s > b ? 'neg' : '') + '">' + (s > b ? 'Te pasaste ' + money(s - b) : 'Quedan ' + money(b - s)) + '</span></div><div class="btrack"><div class="fill ' + (s > b ? 'neg' : '') + '" style="width:' + Math.min(100, s / Math.max(b, 1) * 100).toFixed(1) + '%"></div></div></div>'; }
  h += '</section>';
  const subs = Object.entries(x.subs).sort((a, b) => b[1] - a[1]);
  if (subs.length > 1 || (subs.length === 1 && subs[0][0] !== '_self')) {
    const mx = Math.max(...subs.map(s => s[1]));
    h += '<div class="field"><span class="label">Subcategorías · toca para filtrar</span><div>' + subs.map(([sid, v]) => { const sc = sid === '_self' ? null : cat(sid), on = CS.sub === sid;
      return '<button class="subbar' + (on ? ' on' : '') + '" data-csub="' + esc(sid) + '"><span class="nm">' + esc(sc ? (sc.emoji ? sc.emoji + ' ' : '') + sc.name : 'Sin subcategoría') + '</span><span class="num">' + money(v) + '</span><i style="width:' + (v / mx * 100).toFixed(1) + '%"></i></button>'; }).join('') + '</div></div>';
  }
  let list = S.transactions.filter(t => t.type === 'gasto' && inP(t, p) && inCat(t));
  if (CS.sub) list = list.filter(t => CS.sub === '_self' ? !(cat(t.categoryId) || {}).parentId : t.categoryId === CS.sub);
  list.sort((a, b) => b.amount - a.amount);
  h += '<div class="field"><div class="card-h"><span class="label">' + list.length + (list.length === 1 ? ' movimiento' : ' movimientos') + (CS.sub ? ' · filtrado' : '') + ', de mayor a menor</span>' + (CS.sub ? '<button class="pill" data-csub="">Ver todos</button>' : '') + '</div>' +
    (list.length ? '<div>' + list.map(txRow).join('') + '</div>' : '<div class="empty">Sin movimientos.</div>') + '</div>';
  h += '<p class="note" style="padding:0">Toca un movimiento para editarlo o cambiarle la categoría.</p></div>';
  tipHide(); openSheet(h);
}
document.addEventListener('click', e => {
  const g = e.target.closest('[data-kind="tree"] [data-cid]'); if (g) { e.stopPropagation(); return catSheet(g.dataset.cid); }
  const b = e.target.closest('[data-cs]'); if (b) { e.stopPropagation(); return catSheet(b.dataset.cs); }
  const s = e.target.closest('[data-csub]'); if (s && CS) { e.stopPropagation(); const v = s.dataset.csub || null; const sc = $('#sheet').scrollTop; catSheet(CS.id, CS.sub === v ? null : v); $('#sheet').scrollTop = sc; }
}, true);

/* ---------- arrastrar la hoja hacia abajo para cerrarla (celular) ----------
   Funciona desde cualquier punto de la hoja: si está desplazada, primero sube el contenido y,
   cuando llega arriba, el mismo gesto empieza a bajar la hoja. Solo se excluyen los campos de texto,
   la barra de reparto y las filas que se deslizan de lado. */
(() => {
  let y0 = null, x0 = 0, dy = 0, drag = false, track = [];
  const sh = () => $('#sheet'), sc = () => $('#scrim');
  const mobile = () => window.innerWidth < 1024;
  document.addEventListener('touchstart', e => {
    const s = sh(); if (!s || s.hidden || !mobile() || e.touches.length > 1) return;
    if (!s.contains(e.target)) return;
    if (e.target.closest('input,textarea,select,.chart,.ppct,.pills') && !e.target.closest('.grab,.sheet-h')) return;
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; drag = false; track = [[Date.now(), y0]];
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (y0 === null) return; const s = sh(), y = e.touches[0].clientY, x = e.touches[0].clientX;
    if (!drag) {
      if (Math.abs(x - x0) > 14 && Math.abs(x - x0) > Math.abs(y - y0)) { y0 = null; return; } /* gesto lateral */
      if (s.scrollTop > 0 && !e.target.closest('.grab,.sheet-h')) { y0 = y; return; } /* aún sube el contenido */
      if (y - y0 > 6) { drag = true; s.style.transition = 'none'; } else return;
    }
    e.preventDefault();
    dy = Math.max(0, y - y0); s.style.transform = 'translateY(' + dy + 'px)';
    track.push([Date.now(), y]); if (track.length > 6) track.shift();
    const c = sc(); if (c) c.style.opacity = String(Math.max(0, 1 - dy / 400));
  }, { passive:false });
  const end = () => {
    if (y0 === null) return; const s = sh(), c = sc(); y0 = null;
    if (!drag) return; drag = false;
    const a = track[0], z = track[track.length - 1], v = z && a && z[0] > a[0] ? (z[1] - a[1]) / (z[0] - a[0]) : 0; /* px por ms */
    s.style.transition = ''; if (c) c.style.opacity = '';
    if (dy > 80 || (v > 0.4 && dy > 24)) { s.style.transform = 'translateY(100%)'; setTimeout(() => { s.style.transform = ''; }, 300); closeSheet(); }
    else s.style.transform = '';
  };
  document.addEventListener('touchend', end, { passive:true });
  document.addEventListener('touchcancel', end, { passive:true });
  /* el fondo no se mueve: los toques sobre la sombra no desplazan la página */
  document.addEventListener('touchmove', e => { const s = sh(); if (s && !s.hidden && !s.contains(e.target)) e.preventDefault(); }, { passive:false });
})();

/* ---------- detalle de un día ---------- */
function daySheet(ds){
  const list = S.transactions.filter(t => t.date === ds && t.type !== 'ajuste');
  const d = parseISO(ds), exp = list.filter(t => t.type === 'gasto'), tot = exp.reduce((a, t) => a + t.amount, 0);
  const inc = list.filter(t => t.type === 'ingreso').reduce((a, t) => a + t.amount, 0);
  const byCat = {}; for (const t of exp) { const pc = parentOf(cat(t.categoryId)); const k = pc ? pc.id : '_'; byCat[k] = (byCat[k] || 0) + t.amount; }
  const pl = planFor(periodFor(ds)), inPlan = pl ? exp.filter(t => itemOfCat(pl, t.categoryId)).reduce((a, t) => a + t.amount, 0) : null;
  let h = '<div class="sheet-h"><b id="sheet-title">' + DIAL[d.getDay()] + ' ' + d.getDate() + ' de ' + MESL[d.getMonth()] + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">';
  h += '<section class="card glow" style="padding:16px"><span class="label">Gastaste ese día</span><div class="tile-v num">' + money(tot) + '</div><span class="tile-s">' + exp.length + (exp.length === 1 ? ' gasto' : ' gastos') +
    (inPlan !== null && tot ? ' · ' + money(inPlan) + ' dentro del plan' + (tot - inPlan > 0 ? ', ' + money(tot - inPlan) + ' fuera' : '') : '') + (inc ? ' · entraron ' + money(inc) : '') + '</span>';
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (cats.length > 1) h += '<div class="flowbar" style="margin-top:12px" aria-hidden="true">' + cats.map(([k, v], i) => '<i style="width:' + (v / tot * 100).toFixed(1) + '%;background:' + serieColor(i) + '"></i>').join('') + '</div>' +
    '<div class="legend" style="margin-top:8px">' + cats.map(([k, v], i) => '<span><i class="box" style="background:' + serieColor(i) + '"></i>' + esc(k === '_' ? 'Sin categoría' : cat(k).name) + ' ' + money(v) + '</span>').join('') + '</div>';
  h += '</section>';
  h += list.length ? '<div>' + list.map(txRow).join('') + '</div><p class="note" style="padding:0">Toca un movimiento para editarlo.</p>' : '<div class="empty">No registraste movimientos ese día.</div>';
  h += '<button class="btn ghost block" type="button" data-dayadd="' + ds + '">Registrar un gasto en este día</button></div>';
  tipHide(); openSheet(h);
}
document.addEventListener('click', e => {
  const c = e.target.closest('.cal .c[data-day]'); if (c) { e.stopPropagation(); return daySheet(c.dataset.day); }
  const b = e.target.closest('[data-dayadd]'); if (b) { e.stopPropagation(); const ds = b.dataset.dayadd; txForm(null); F.date = ds; drawForm(); }
}, true);
document.addEventListener('keydown', e => { const c = e.target.closest && e.target.closest('.cal .c[data-day]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); daySheet(c.dataset.day); } });
