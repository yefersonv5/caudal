/* Eventos generales, navegación, privacidad y arranque de la app. */
let toastT;
function toast(m, ms){ const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms || 2000); }
function scrollMovs(){ requestAnimationFrame(() => { const m = document.getElementById('movs'); if (m) window.scrollTo({ top:m.getBoundingClientRect().top + window.scrollY - 70, behavior:'smooth' }); }); }
const EYE_ON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 13.5C4.6 9.6 8 7.5 12 7.5s7.4 2.1 9.5 6"/><circle cx="12" cy="14" r="2.6"/></svg>';
const EYE_OFF = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5c2.1 3.4 5.5 5.3 9.5 5.3s7.4-1.9 9.5-5.3"/><path d="M5.6 14l-1.5 2M12 15.9v2.4M18.4 14l1.5 2M8.6 15.4l-.8 2.3M15.4 15.4l.8 2.3"/></svg>';
/* privacidad al estilo Nu: el ojo arriba oculta todos los montos con •••• */
const privOn = () => document.body.classList.contains('priv');
const MASK_RX = [/(−|-)?\$\s?\d[\d.]*(,\d+)?/g, /\b\d{1,3}(\.\d{3})+(,\d+)?\b/g];
function maskNode(root){
  if (!privOn() || !root) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode:n => n.parentElement && n.parentElement.closest('#plabel,script,style,textarea') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const list = []; while (w.nextNode()) list.push(w.currentNode);
  for (const n of list) { let v = n.nodeValue, o = v; v = v.replace(MASK_RX[0], '$ ••••').replace(MASK_RX[1], '••••'); if (v !== o) n.nodeValue = v; }
}
function eyeSync(){ const b = document.getElementById('eyebtn'); if (b) { b.innerHTML = privOn() ? EYE_OFF : EYE_ON; b.setAttribute('aria-label', privOn() ? 'Mostrar valores' : 'Ocultar valores'); } }
try { if (localStorage.getItem('caudal.priv') === '1') document.body.classList.add('priv'); } catch (_) {}
new MutationObserver(ms => { if (!privOn()) return; for (const m of ms) { if (m.type === 'characterData') maskNode(m.target.parentNode); else m.addedNodes.forEach(n => maskNode(n.nodeType === 3 ? n.parentNode : n)); } })
  .observe(document.body, { childList:true, subtree:true, characterData:true });
document.addEventListener('click', e => { const b = e.target.closest('#eyebtn'); if (!b) return; e.stopPropagation(); const on = !privOn(); document.body.classList.toggle('priv', on); try { localStorage.setItem('caudal.priv', on ? '1' : '0'); } catch (_) {} eyeSync(); render(); if (on) maskNode(document.body); const sh = document.getElementById('sheet'); if (!on && sh && !sh.hidden) closeSheet(); }, true);
function go(v, sec){
  const from = ui.view;
  if (v === 'ajustes') { ui.setSec = sec || null; ui.setQ = '';
    if (from !== 'ajustes') { ui.ajFrom = from; navPush('aj'); if (sec) navPush('sec'); } else navTo(Math.min(NAVH.depth, sec ? 2 : 1)); }
  else if (from === 'ajustes') navTo(0);
  ui.view = v; ui.resetArm = false; render(); window.scrollTo({ top:0 });
}
/* ---------- volver con el gesto del celular ----------
   Ajustes y sus secciones se apilan en el historial del navegador: el gesto de volver (o el botón atrás
   de Android) regresa de la sección a la lista y de la lista a la pantalla donde estabas.
   En la app instalada en el iPhone, que no trae ese gesto, se hace a mano deslizando desde el borde izquierdo. */
const NAVH = { depth:0, skip:0, popAt:0 };
function navPush(s){ if (isDesk()) return; try { history.pushState({ cau:s }, ''); NAVH.depth++; } catch (_) {} }
function navTo(n){ if (NAVH.depth > n) { const k = NAVH.depth - n; NAVH.depth = n; NAVH.skip++; try { history.go(-k); } catch (_) { NAVH.skip--; } } }
function navAnim(cls){ const v = document.querySelector('#main .view'); if (v) { v.classList.remove('navfwd', 'navback'); void v.offsetWidth; v.classList.add(cls); } }
window.addEventListener('popstate', () => {
  if (NAVH.skip) { NAVH.skip--; return; }
  NAVH.popAt = Date.now(); if (NAVH.depth > 0) NAVH.depth--;
  const sh = $('#sheet'); if (sh && !sh.hidden) { closeSheet(); navPush('sheet'); return; } /* con una ventana abierta, el gesto solo la cierra */
  if (ui.view !== 'ajustes') return;
  if (ui.setSec && !isDesk()) { ui.setSec = null; ui.setQ = ''; }
  else { ui.view = ui.ajFrom && ui.ajFrom !== 'ajustes' ? ui.ajFrom : 'inicio'; ui.resetArm = false; }
  render(); window.scrollTo({ top:0 }); navAnim('navback');
});
(() => {
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  if (!standalone) return;
  let x0 = null, y0 = 0, dx = 0, on = false, t0 = 0;
  const main = () => $('#main');
  document.addEventListener('touchstart', e => {
    x0 = null; if (isDesk() || NAVH.depth < 1 || ui.view !== 'ajustes' || !$('#sheet').hidden || e.touches.length > 1) return;
    const t = e.touches[0]; if (t.clientX > 30) return;
    x0 = t.clientX; y0 = t.clientY; dx = 0; on = false; t0 = Date.now();
  }, { passive:true });
  document.addEventListener('touchmove', e => {
    if (x0 === null) return; const t = e.touches[0]; dx = t.clientX - x0; const dy = t.clientY - y0;
    if (!on) { if (Math.abs(dy) > 12 && Math.abs(dy) > dx) { x0 = null; return; } if (dx > 10) { on = true; main().style.transition = 'none'; } else return; }
    e.preventDefault(); main().style.transform = 'translateX(' + Math.max(0, dx) + 'px)';
  }, { passive:false });
  const end = () => {
    if (x0 === null) return; x0 = null; if (!on) return; on = false;
    const m = main(), v = dx / Math.max(1, Date.now() - t0);
    if (dx > window.innerWidth * 0.3 || (v > 0.45 && dx > 40)) {
      m.style.transition = 'transform .18s ease-out'; m.style.transform = 'translateX(100%)';
      setTimeout(() => { m.style.transition = 'none'; m.style.transform = ''; if (NAVH.popAt < t0) history.back(); requestAnimationFrame(() => { m.style.transition = ''; }); }, 180);
    } else { m.style.transition = 'transform .2s ease-out'; m.style.transform = ''; setTimeout(() => { m.style.transition = ''; }, 220); }
  };
  document.addEventListener('touchend', end, { passive:true });
  document.addEventListener('touchcancel', end, { passive:true });
})();


document.addEventListener('click', e => {
  const el = e.target.closest('button,[data-close]'); if (!el) return;
  const d = el.dataset;
  if ((el.closest('.nav-in') || el.classList.contains('gear')) && d.v) return go(d.v);
  if (el.id === 'fab' || d.add !== undefined) return txForm(null, d.add);
  if (el.id === 'prev') { ui.offset--; return render(); }
  if (el.id === 'next') { ui.offset++; return render(); }
  if (d.go) return go(d.go, d.sec);
  if (d.tx) { const t = S.transactions.find(x => x.id === d.tx); if (t) txForm(t); return; }
  if (d.clearf !== undefined) { ui.accFilter = null; return render(); }
  if (d.st) { ui.statsType = d.st; ui.open.clear(); return render(); }
  if (d.open) { ui.open.has(d.open) ? ui.open.delete(d.open) : ui.open.add(d.open); return render(); }
  if (d.acc) { ui.accFilter = d.acc; ui.view = 'inicio'; render(); return scrollMovs(); }
  if (d.newacc !== undefined) return accForm();
  if (d.newcat !== undefined) return catForm(null, d.newcat || null);
  if (d.close !== undefined) return closeSheet();
  if (el.id === 'copyjson') { const txt = JSON.stringify(S);
    navigator.clipboard.writeText(txt).then(() => toast('Respaldo copiado'), () => { $('#impmsg').textContent = 'Tu navegador no dejó copiar. Intenta de nuevo desde Safari o Chrome.'; }); return; }
  if (el.id === 'reset') { if (!ui.resetArm) { ui.resetArm = true; return render(); }
    try { localStorage.removeItem(KEY); } catch(_){} S = makeDemo(); ui = { ...ui, resetArm:false, offset:0, accFilter:null }; go('inicio'); return toast('Datos borrados'); }
  if (d.k && d.k.startsWith('rv') && (d.gp || d.gsel || d.gs || d.gopen) && SM && SM.items) { const it = SM.items[+d.k.slice(2)]; if (!it) return;
    const c = cat(it.categoryId), st = { parent:c ? (c.parentId || c.id) : null, sub:c && c.parentId ? c.id : null, open:!!it._open || !it.categoryId, expand:it._expand };
    gridTap(st, d); it.categoryId = st.sub || st.parent || it.categoryId; it._open = st.open; it._expand = st.expand; if (it.err === 'Elige una categoría.' && it.categoryId) it.err = ''; return drawReview(); }
  if (!F) return;
  if (el.id === 'f-pend') { syncForm(); F.pending = !F.pending; return drawForm(); }
  if (d.ft) return cambiarTipo(d.ft);
  if (d.k === 'f' && (d.gp || d.gsel || d.gs || d.gopen)) { syncForm(); const st = { parent:F.parent, sub:F.sub, open:F.catOpen || !F.parent, expand:F.expand }; gridTap(st, d);
    F.parent = st.parent; F.sub = st.sub; F.catOpen = st.open; F.expand = st.expand; return drawForm(); }

  if (d.fa) { syncForm(); F[d.fa] = d.id; return drawForm(); }
  if (d.xmode !== undefined) { syncForm(); /* dividir: empieza con una segunda parte en partes iguales */
    if (F.splitMode) { F.splitMode = null; F.parts = []; } else { F.splitMode = 'multi'; F.igual = true; F.parts = [{ cat:'', acc:F.accountId, amount:0, _open:true }]; }
    $('#f-err') && ($('#f-err').textContent = ''); return drawForm(); }
  if (d.xadd !== undefined) { syncForm(); F.parts.forEach(p => { p._open = false; p._expand = null; }); F.parts.push({ cat:'', acc:F.accountId, amount:0, _open:true }); return drawForm(); }
  if (d.xpick !== undefined) { syncForm(); const i = +d.xpick, ab = F.parts[i]._open; F.parts.forEach(p => { p._open = false; p._expand = null; }); F.parts[i]._open = !ab; return drawForm(); }
  if (d.xigual) { syncForm(); F.igual = d.xigual === '1'; return drawForm(); }
  if (d.k && d.k[0] === 'x' && (d.gp || d.gsel || d.gs || d.gopen)) { const p = (F.parts || [])[+d.k.slice(1)]; if (!p) return; syncForm();
    const c = cat(p.cat), st = { parent:c ? (c.parentId || c.id) : null, sub:c && c.parentId ? c.id : null, open:!!p._open || !p.cat, expand:p._expand || null };
    gridTap(st, d); p.cat = st.sub || st.parent || ''; p._open = st.open; p._expand = st.expand; $('#f-err').textContent = ''; drawForm();
    if (!st.open) { const i = document.querySelector('[data-xamt="' + d.k.slice(1) + '"]'); if (i && !p.amount) i.focus(); } return; }
  if (d.xdel !== undefined) { syncForm(); F.parts.splice(+d.xdel, 1); if (!F.parts.length) F.splitMode = null; return drawForm(); }
  if (d.sign) { syncForm(); F.amount = Math.abs(F.amount) * Number(d.sign); return drawForm(); }
  if (el.id === 'f-del') { if (!ui.delArm) { ui.delArm = true; el.className = 'btn block danger'; el.textContent = 'Toca otra vez para eliminar'; return; }
    { const del = new Set([F.id]); if (F.grp) S.transactions.forEach(x => { if (x.grp === F.grp) del.add(x.id); });
      S.transactions = S.transactions.filter(x => !del.has(x.id) && !(del.has(x.auto) && x.pending && x.type === 'transferencia')); } save(); const ret = CQ_RET; closeSheet(); render(); if (ret) setTimeout(ret, 300); return toast('Movimiento eliminado'); }
});
$('#scrim').addEventListener('click', closeSheet);
/* el botón de registrar va dentro de la barra lateral en computador y flota sobre la barra en el celular */
(() => {
  const mq = window.matchMedia('(min-width:1024px)');
  const place = () => { const f = $('#fab'), n = $('.nav-in'); if (!f || !n) return;
    if (mq.matches) { if (n.firstChild !== f) n.insertBefore(f, n.firstChild); } else if (f.parentNode !== document.body) document.body.appendChild(f); };
  place(); mq.addEventListener ? mq.addEventListener('change', place) : mq.addListener(place);
})();
/* en el celular el botón se encoge a un círculo al bajar y vuelve a mostrar su nombre al subir */
(() => { let y0 = 0;
  addEventListener('scroll', () => { const y = scrollY; document.body.classList.toggle('fab-min', y > 80 && y >= y0); y0 = y; }, { passive:true });
})();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });

document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'f-amt' || t.dataset.bud !== undefined || t.id === 'a-bal') {
    pesosCampo(t);
    if (t.id === 'f-amt') $('#f-err').textContent = '';
  }
  if (F && (t.id === 'f-amt' || t.dataset.xamt !== undefined)) {
    /* escribir el valor de una parte pasa a valores exactos; cambiar el total reparte de nuevo si van iguales */
    if (t.dataset.xamt !== undefined) { F.parts[+t.dataset.xamt].amount = pesosCampo(t); F.igual = false; document.querySelectorAll('[data-xigual]').forEach(b => b.setAttribute('aria-pressed', b.dataset.xigual === '0')); $('#f-err').textContent = ''; }
    if (t.id === 'f-amt') { F.amount = readAmt(); splitIgual(); (F.parts || []).forEach((p, i) => { const el = document.querySelector('[data-xamt="' + i + '"]'); if (el && F.igual) el.value = p.amount ? nf.format(p.amount) : ''; }); }
    const r = $('#f-rest'); if (r) r.innerHTML = splitMainTxt();
    const xr = $('#f-xres'); if (xr) xr.innerHTML = splitCuentas();
    const fb = $('#f-bud'); if (fb && fb.dataset.left !== '') fb.innerHTML = fbudTxt(fb.dataset.name, +fb.dataset.left, Math.max(0, Math.abs(F.amount) - partsSum()));
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'mmfile' && t.files[0]) importMM(t.files[0]);
  if (t.id === 'jsonfile' && t.files[0]) importJSON(t.files[0]);
  if (F && t.dataset.xacc === 'main') { syncForm(); F.accountId = t.value; F.fund = null; drawForm(); } /* la cuenta de la parte 1 es la del gasto */
  else if (F && t.dataset.xacc !== undefined) { F.parts[+t.dataset.xacc].acc = t.value; const xr = $('#f-xres'); if (xr) xr.innerHTML = splitCuentas(); }
  if (t.id === 'paylast') { S.settings.payLast = Number(t.value); save(); render(); toast('Periodo actualizado'); }
  if (t.id === 'sday') { S.settings.startDay = Number(t.value); save(); ui.offset = 0; render(); toast('Periodo actualizado'); }
  if (t.dataset.bud !== undefined) { const v = leerPesos(t.value); if (v) S.budgets[t.dataset.bud] = v; else delete S.budgets[t.dataset.bud]; save(); toast('Presupuesto guardado'); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'txf') return submitForm();
  if (e.target.id === 'accf') {
    const name = $('#a-name').value.trim(), group = $('#a-group').value.trim() || 'Otros';
    if (!name) { $('#a-err').textContent = 'Escribe el nombre de la cuenta.'; return; }
    const id = uid(); S.accounts.push({ id, name, group, order:S.accounts.length + 1, hidden:false });
    const bal = leerPesos($('#a-bal').value);
    if (bal) S.transactions.push({ id:uid(), type:'ajuste', amount:bal, date:iso(new Date()), ts:Date.now(), accountId:id, note:'Saldo inicial' });
    sortTx(S); save(); closeSheet(); render(); toast('Cuenta creada');
  }
});

render();
