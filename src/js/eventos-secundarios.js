/* Eventos del registro con IA, pagos programados, bandeja y chat; arranque de pagos y bandeja. */
document.addEventListener('click', e => {
  const el = e.target.closest('button,[data-smart]'); if (!el) return;
  const d = el.dataset;
  if (d.smart) { if (d.smart === 'banco') { SM = { text:EXAMPLES[3], files:[], items:null, origin:'smart' }; closeSheetNow(); drawSmart(); return; } closeSheetNow(); return smartOpen(d.smart); }
  if (d.inbox !== undefined) return openInbox();
  if (d.askex) return ask(ASK_EX[+d.askex]);
  if (d.newrec !== undefined) return recForm(null);
  if (d.rec) return recForm((S.recurring || []).find(r => r.id === d.rec));
  if (d.sug) { const s = SUG[+d.sug]; if (s) recForm({ ...s, id:null, active:true }); return; }
  if (d.rt && RF) { RF.type = d.rt; RF.name = $('#r-name').value; RF.amount = leerPesos($('#r-amt').value); RF.day = +$('#r-day').value; RF.accountId = $('#r-acc').value; RF.categoryId = ''; closeSheetNow(); return recForm(RF); }
  if (el.id === 'r-del' && RF) { S.recurring = (S.recurring || []).filter(r => r.id !== RF.id); save(); closeSheet(); render(); return toast('Pago programado eliminado'); }
  if (d.fq && F) { const q = FQ[+d.fq]; if (!q) return; syncForm(); const c = cat(q.categoryId); F.amount = q.amount; F.note = q.note; F.accountId = q.accountId; F.parent = c ? (c.parentId || c.id) : null; F.sub = c && c.parentId ? c.id : null; return drawForm(); }
  if (el.id === 'go-smart') { closeSheetNow(); return smartOpen('texto'); }
  if (!SM) return;
  if (el.id === 'sm-go') return smartGo();
  if (el.id === 'sm-mic') { const t = $('#sm-text'); if (t) SM.text = t.value; return startVoice(); }
  if (el.id === 'sm-clear') { SM.text = ''; SM.files = []; return drawSmart(); }
  if (d.ex) { SM.text = EXAMPLES[+d.ex]; drawSmart(); return; }
  if (d.rmph) { SM.files.splice(+d.rmph, 1); const t = $('#sm-text'); if (t) SM.text = t.value; return drawSmart(); }
  if (d.rvpend) { const it = SM.items[+d.rvpend]; if (it) it.pending = !it.pending; return drawReview(); }
  if (d.rvdel) { const it = SM.items.splice(+d.rvdel, 1)[0]; if (it && it.inboxId) { S.inbox = (S.inbox || []).filter(x => x.id !== it.inboxId); save(); } if (!SM.items.length) { const o = SM.origin; SM = null; closeSheet(); render(); return toast(o === 'inbox' ? 'Bandeja vacía' : 'Descartado'); } return drawReview(); }
  if (el.id === 'rv-save') return reviewSave();
  if (el.id === 'rv-back') { SM.items = null; return drawSmart(); }
  if (el.id === 'rv-ai') return smartGo(true);
});
function closeSheetNow(){ F = null; }
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'sm-photo' && t.files && t.files.length && SM) { const ta = $('#sm-text'); if (ta) SM.text = ta.value; SM.files = SM.files.concat(Array.from(t.files)).slice(0, 4); drawSmart(aiOn() ? '' : 'Leer fotos necesita la IA, que no está disponible en esta vista.'); return; }
  if (t.dataset && t.dataset.rv !== undefined && SM && SM.items) {
    const it = SM.items[+t.dataset.rv], f = t.dataset.f; if (!it) return;
    if (f === 'amount') it.amount = leerPesos(t.value);
    else if (f === 'type') { it.type = t.value; it.categoryId = it.type === 'transferencia' ? null : cat(guess(it.note, it.type, learn()).cat) ? guess(it.note, it.type, learn()).cat : null; drawReview(); }
    else it[f] = t.value || null;
  }
});
document.addEventListener('input', e => {
  const t = e.target;
  if (F && t.dataset.xrange !== undefined) { F.pct = 100 - Number(t.value); const xb = $('#xbtxt'); if (xb) xb.innerHTML = splitBarTxt();
    const fb = $('#f-bud'); if (fb && fb.dataset.left !== '') fb.innerHTML = fbudTxt(fb.dataset.name, +fb.dataset.left, Math.max(0, Math.abs(F.amount) - partsSum())); return; }
  if (t.dataset && t.dataset.rv !== undefined && t.dataset.f === 'amount') { const v = pesosCampo(t); if (SM && SM.items[+t.dataset.rv]) SM.items[+t.dataset.rv].amount = v || 0; }
  if (t.dataset && t.dataset.rv !== undefined && t.dataset.f === 'note' && SM && SM.items[+t.dataset.rv]) SM.items[+t.dataset.rv].note = t.value;
  if (t.id === 'r-amt') { pesosCampo(t); }
  if (t.id === 'sm-text' && SM) SM.text = t.value;
});
document.addEventListener('keydown', e => { if (e.target.id === 'sm-text' && e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) { e.preventDefault(); smartGo(); } });
document.addEventListener('submit', e => {
  if (e.target.id === 'recf') { e.preventDefault(); recSave(); }
  if (e.target.id === 'askf') { e.preventDefault(); ask($('#ask-q').value); }
}, true);

completarEstado(S);
runRecurring();
intake();
