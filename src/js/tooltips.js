/* Lectura de gráficas: ventana con el detalle al tocar o pasar el cursor. */
function tipShow(x, y, title, rows){
  const t = $('#tip'); t.replaceChildren();
  const h = document.createElement('div'); h.className = 'tt'; h.textContent = title; t.append(h);
  rows.forEach(([col, label, val, dash]) => { const r = document.createElement('div'); r.className = 'tr';
    const i = document.createElement('i'); i.style.borderTopColor = col; if (dash) i.style.borderTopStyle = 'dashed';
    const s = document.createElement('span'); s.textContent = label; const b = document.createElement('b'); b.textContent = val; r.append(i, s, b); t.append(r); });
  t.classList.add('on');
  const w = t.offsetWidth, hh = t.offsetHeight;
  t.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x - w / 2)) + 'px';
  let ly = y - hh - 12; if (ly < 8) ly = y + 18; t.style.top = ly + 'px';
}
function tipHide(){ const t = $('#tip'); if (t) t.classList.remove('on'); const xh = document.getElementById('xh'); if (xh) xh.style.display = 'none'; }
function onChart(e){
  const c = e.target.closest && e.target.closest('.chart');
  if (!c) { if (e.type === 'pointerdown') tipHide(); return; }
  const kind = c.dataset.kind;
  if (kind === 'ritmo') {
    const R = CH.ritmo, svg = c.querySelector('svg'), rc = svg.getBoundingClientRect();
    const xs = (e.clientX - rc.left) / rc.width * R.W;
    const i = Math.max(0, Math.min(R.N - 1, Math.round((xs - R.L) / R.pw * (R.N - 1))));
    const xh = document.getElementById('xh'); xh.style.display = '';
    const x = R.X(i), ln = xh.querySelector('line'); ln.setAttribute('x1', x); ln.setAttribute('x2', x);
    const d1 = xh.querySelector('.d1'), d2 = xh.querySelector('.d2');
    if (i < R.cur.length) { d1.style.display = ''; d1.setAttribute('cx', x); d1.setAttribute('cy', R.Y(R.cur[i])); } else d1.style.display = 'none';
    if (i < R.prev.length) { d2.style.display = ''; d2.setAttribute('cx', x); d2.setAttribute('cy', R.Y(R.prev[i])); } else d2.style.display = 'none';
    const d = new Date(R.p.start); d.setDate(d.getDate() + i);
    const rows = [];
    if (i < R.cur.length) rows.push([PAL.lima, R.mode === 'acum' ? 'Llevabas' : 'Gastaste', money(R.cur[i])]);
    if (i < R.prev.length) rows.push([PAL.velo(.4), 'Mes pasado', money(R.prev[i])]);
    if (R.ref > 0) rows.push([PAL.gris, R.mode === 'acum' ? 'Ideal a esa fecha' : 'Presupuesto por día', money(R.mode === 'acum' ? R.B * (i + 1) / R.N : R.ref), true]);
    tipShow(rc.left + x / R.W * rc.width, rc.top + 8, 'Día ' + (i + 1) + ' · ' + d.getDate() + ' ' + MES[d.getMonth()], rows);
    return;
  }
  const m = e.target.closest('[data-i]');
  if (!m || !CH[kind]) { tipHide(); return; }
  const it = CH[kind][+m.dataset.i]; if (!it) return;
  const r = m.getBoundingClientRect();
  tipShow(r.left + r.width / 2, r.top, it.title, it.rows);
}
$('#main').addEventListener('pointermove', onChart);
document.addEventListener('pointerdown', onChart);
$('#main').addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.chart'))) tipHide(); });
window.addEventListener('scroll', tipHide, { passive:true });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-rit],[data-txf],[data-alltx],[data-ritprev]'); if (!b) return;
  if (b.dataset.ritprev !== undefined) ui.ritPrev = !ui.ritPrev; else if (b.dataset.rit) ui.ritmo = b.dataset.rit; else if (b.dataset.txf) ui.txf = b.dataset.txf; else ui.allTx = !ui.allTx;
  render();
});
document.addEventListener('click', e => { const b = e.target.closest('[data-pmode]'); if (!b) return;
  const on = S.settings.periodMode !== 'sueldo'; if (on) S.settings.periodMode = 'sueldo'; else delete S.settings.periodMode;
  save(); ui.offset = 0; render(); toast(on ? 'Ahora el periodo empieza con tu sueldo' : 'Periodo por día fijo'); });
document.addEventListener('change', e => { if (e.target.id === 'uname') { S.settings.name = e.target.value.trim() || 'Yeferson'; save(); toast('Nombre guardado'); } });
