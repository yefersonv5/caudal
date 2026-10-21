/* Bandeja: lo que llega de los atajos del iPhone espera aquí hasta revisarlo. */
function parseInboxSrc(src){
  const L = learn(), day = src.date || iso(new Date());
  if (Array.isArray(src.items) && src.items.length) return src.items.map(x => clean1({ date:day, ...x }, L)).filter(Boolean).map(it => ({ ...it, src:src.kind === 'sms' ? 'banco' : 'siri' })); // ya leído con IA en el servidor
  if (src.kind === 'applepay') { const am = amountsIn(String(src.monto || ''))[0]; if (!am) return [];
    const comercio = String(src.comercio || '').trim(), key = norm(src.tarjeta || ''), g = guess(comercio, 'gasto', L);
    return [{ type:'gasto', amount:am.v, date:day, note:comercio || 'Apple Pay', categoryId:g.cat, accountId:(S.cardMap || {})[key] || g.acc || lastAccount(), last4:key || null, src:'applepay' }]; }
  if (src.kind === 'sms') { const it = bankParse(src.n || '') || localParse(src.n || '')[0]; return it ? [it] : []; }
  return localParse(src.t || '').map(it => ({ ...it, src:'siri' }));
}
function inboxAdd(rowId, raw, src, at){
  S.inbox = S.inbox || [];
  const items = parseInboxSrc(src || {});
  if (!items.length) items.push({ type:'gasto', amount:0, date:(src && src.date) || iso(new Date()), note:String(raw || '').slice(0, 60), categoryId:null, accountId:lastAccount(), src:'atajo' });
  items.forEach((it, k) => S.inbox.push({ id:rowId + '#' + k, rowId, raw, src, at:at || Date.now(), item:it }));
}
function intake(){
  let q; try { q = new URLSearchParams(location.search); } catch (_) { return; }
  const txt = q.get('t') || q.get('texto'), sms = q.get('n') || q.get('notificacion'), monto = q.get('monto');
  if (!txt && !sms && !monto) return;
  const day = iso(new Date());
  if (monto) inboxAdd(uid(), 'Apple Pay · ' + (q.get('comercio') || ''), { kind:'applepay', monto, comercio:q.get('comercio') || '', tarjeta:q.get('tarjeta') || '', date:day });
  if (sms) inboxAdd(uid(), sms.slice(0, 160), { kind:'sms', n:sms, date:day });
  if (txt) inboxAdd(uid(), txt.slice(0, 160), { kind:'texto', t:txt, date:day });
  save();
  try { history.replaceState(null, '', location.pathname); } catch (_) {}
  setTimeout(openInbox, 450);
}
function openInbox(){
  const box = S.inbox || []; if (!box.length) return;
  SM = { text:'', files:[], items:box.map(x => ({ ...x.item, inboxId:x.id })), origin:'inbox', engine:'local', discarded:[] };
  drawReview();
}
/* al abrir la app con movimientos nuevos de los atajos, la revisión se abre sola */
function autoInbox(){
  const box = S.inbox || []; if (!box.length || SM || F || BF || RF || (typeof PF !== 'undefined' && PF)) return;
  let seen = []; try { seen = JSON.parse(localStorage.getItem('caudal.seenInbox') || '[]'); } catch (_) {}
  const fresh = box.filter(x => !seen.includes(x.id)); if (!fresh.length) return;
  try { localStorage.setItem('caudal.seenInbox', JSON.stringify(box.map(x => x.id).slice(-200))); } catch (_) {}
  openInbox();
}
function inboxCard(){
  const n = (S.inbox || []).length; if (!n) return '';
  return '<section class="card glow"><div class="card-h"><h2>Por revisar</h2><span class="pill">' + n + '</span></div><p class="insight">Llegaron desde tus atajos del iPhone. Confírmalos para que cuenten en tus números.</p><button class="btn" data-inbox>Revisar ahora</button></section>';
}
