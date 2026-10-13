/* ---------- Avisos: notificaciones push programadas desde la app y enviadas por la función "avisos" ---------- */
const PUSH_PUB = 'BF6xos1DnlQP-4jMcs6M8OoBF_LeoTAqxKpZL0lMU6Ask0YH6AIbpoWjn5vmowwPHZFB2Gk34NetOy5-vUSt55U';
const AV_KINDS = [
  ['recibos', 'Recibos por pagar', 'El día que toca pagar y el día que vencen, 9 a. m.'],
  ['tarjeta', 'Pago de la tarjeta', 'Dos días antes y el día del pago, con lo que debes'],
  ['diario', 'Registrar el día', 'A las 8 p. m., solo si ese día no registraste nada'],
  ['mover', 'Traslados y por confirmar', 'Al día siguiente, si quedó algo pendiente'],
  ['cierre', 'Cierre del periodo', 'El primer día del periodo nuevo'],
];
let AV = { on:false, busy:false, msg:'' };
const avPrefs = () => { try { return JSON.parse(localStorage.getItem('caudal.avisos') || '{}'); } catch (_) { return {}; } };
const avOn = k => avPrefs()[k] !== false;
const pushCapable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const avHash = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
const b64u = s => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };

async function avState(){
  if (!pushCapable() || Notification.permission !== 'granted') { AV.on = false; return; }
  try { const reg = await navigator.serviceWorker.ready; AV.on = !!(await reg.pushManager.getSubscription()); } catch (_) { AV.on = false; }
}
async function avEnable(){
  if (!sb || !session) { AV.msg = 'Entra a tu cuenta para activar los avisos.'; return render(); }
  AV.busy = true; AV.msg = ''; render();
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('Sin permiso. Actívalo en Ajustes del iPhone > Notificaciones > Caudal.');
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64u(PUSH_PUB) });
    const j = sub.toJSON();
    const { error } = await sb.from('push_subs').upsert({ user_id:session.user.id, endpoint:j.endpoint, keys:j.keys });
    if (error) throw new Error('No pude guardar el permiso: ' + error.message);
    AV.on = true; await avSchedule(true); toast('Avisos activados');
  } catch (e) { AV.msg = e.message || 'No se pudieron activar los avisos.'; }
  AV.busy = false; render();
}
async function avDisable(){
  try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { if (sb && session) await sb.from('push_subs').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); } } catch (_) {}
  if (sb && session) await sb.from('push_queue').delete().is('sent_at', null);
  AV.on = false; render(); toast('Avisos desactivados');
}
async function avTest(){
  if (!sb || !session) return;
  const { error } = await sb.from('push_queue').upsert({ user_id:session.user.id, id:'prueba-' + Date.now(), at:new Date().toISOString(), kind:'prueba', title:'Caudal', body:'Así te van a llegar los avisos.' });
  if (error) return toast('No pude programar la prueba');
  try { await sb.functions.invoke('avisos', { body:{} }); } catch (_) {}
  toast('Enviada: debe llegar en segundos', 3000);
}

/* calcula los avisos de los próximos días y los deja en la cola del servidor */
function avItems(){
  const out = [], now = Date.now();
  const at = (d, h, m) => { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; };
  const add = (kind, when, title, body) => { if (when.getTime() > now + 60000) out.push({ id:kind + '-' + iso(when) + '-' + avHash(title), at:when.toISOString(), kind, title, body }); };
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
  if (avOn('recibos')) for (const b of (S.bills || []).filter(b => b.active !== false)) {
    const c = billCycle(b); if (c.cy.paid) continue;
    add('recibos', at(c.pay, 9), 'Hoy toca pagar ' + b.name, (c.amount ? 'Cerca de ' + money(c.amount) + '. ' : '') + 'Vence el ' + c.due.getDate() + ' de ' + MESL[c.due.getMonth()] + '.');
    if (iso(c.due) !== iso(c.pay)) add('recibos', at(c.due, 9), 'Vence hoy: ' + b.name, 'Si ya lo pagaste, márcalo en Caudal.');
  }
  if (avOn('tarjeta')) for (const a of S.accounts.filter(a => isCard(a) && !a.hidden && a.card.due)) {
    const B = balances(), debt = Math.max(0, -(B[a.id] || 0)), pk = cardPocket(a), have = B[pk] || 0, due = nextDay(a.card.due);
    if (debt > 0) {
      const left = have - debt, extra = left >= 0 ? 'Te sobran ' + money(left) + '.' : 'Te faltan ' + money(-left) + '.';
      const pre = new Date(due); pre.setDate(pre.getDate() - 2);
      add('tarjeta', at(pre, 9), 'Pagas la tarjeta el ' + due.getDate() + ' de ' + MESL[due.getMonth()], 'Debes ' + money(debt) + ' y en ' + accShort(pk) + ' tienes ' + money(have) + '. ' + extra);
      add('tarjeta', at(due, 8), 'Hoy pagas la tarjeta', 'Debes ' + money(debt) + '. Al pagar, regístralo con "Pagar tarjeta".');
    }
  }
  if (avOn('diario')) for (let n = 0; n < 7; n++) add('diario', at(day(n), 20), '¿Registraste tus gastos de hoy?', 'Anótalos ahora que te acuerdas: con la voz toma segundos.');
  if (avOn('mover')) {
    const mv = pendingMoves(), pend = S.transactions.filter(t => t.pending && t.type !== 'transferencia');
    if (mv.length) add('mover', at(day(1), 19), 'Tienes ' + (mv.length === 1 ? 'un traslado' : mv.length + ' traslados') + ' por mover', mv.slice(0, 2).map(t => money(t.amount) + ' de ' + accShort(t.accountId) + ' a ' + accShort(t.toAccountId)).join(' · '));
    if (pend.length) add('mover', at(day(1), 12, 30), (pend.length === 1 ? 'Un valor' : pend.length + ' valores') + ' por confirmar', 'Corrígelos con lo que dice el banco para que tus cuentas cuadren.');
  }
  if (avOn('cierre')) { const p1 = period(1); add('cierre', at(p1.start, 9), 'Cerró tu periodo', 'Mira cómo te fue y qué ajustar del plan.'); }
  return out;
}
let avT = null, avLast = '';
function avSchedule(now){
  clearTimeout(avT);
  return new Promise(res => { avT = setTimeout(async () => {
    if (!AV.on || !sb || !session || S.demo) return res();
    const items = avItems(), sig = JSON.stringify(items);
    if (sig === avLast && !now) return res();
    try {
      if (items.length) await sb.from('push_queue').upsert(items.map(x => ({ ...x, user_id:session.user.id })), { onConflict:'user_id,id' });
      let q = sb.from('push_queue').delete().is('sent_at', null).gt('at', new Date().toISOString()).neq('kind', 'prueba');
      if (items.length) q = q.not('id', 'in', '(' + items.map(x => x.id).join(',') + ')');
      await q; avLast = sig;
    } catch (_) {}
    res();
  }, now ? 0 : 2500); });
}
/* reprograma cada vez que cambian los datos */
const _saveAv = save;
save = function(){ const r = _saveAv.apply(this, arguments); avSchedule(); return r; };
document.addEventListener('visibilitychange', () => { if (!document.hidden) avState().then(() => avSchedule()); });
setTimeout(() => avState().then(() => avSchedule()), 4000);

function pushCard(){
  let h = '<section class="card"><div class="card-h"><h2>Avisos</h2></div>';
  if (!pushCapable()) return h + '<p class="insight">Para recibir avisos en el iPhone, abre Caudal desde su ícono en la pantalla de inicio (no desde Safari) y vuelve a esta sección.</p></section>';
  if (!AV.on) return h + '<p class="insight">Te llegan al celular aunque no abras la app: recibos por vencer, el pago de la tarjeta, un recordatorio para registrar el día y más.</p>' +
    (AV.msg ? '<div class="err">' + esc(AV.msg) + '</div>' : '') + '<button class="btn accent block" data-avon' + (AV.busy ? ' disabled' : '') + '>' + (AV.busy ? 'Activando…' : 'Activar avisos') + '</button></section>';
  const P = avPrefs();
  h += '<div>' + AV_KINDS.map(([k, t, s], i) => '<div class="set"' + (i ? '' : ' style="border-top:0"') + '><div class="t"><b>' + t + '</b><span>' + s + '</span></div><button class="pill" data-avk="' + k + '" aria-pressed="' + (P[k] !== false) + '">' + (P[k] !== false ? 'Sí' : 'No') + '</button></div>').join('') + '</div>';
  return h + '<div class="two"><button class="btn ghost" data-avtest>Enviar prueba</button><button class="btn ghost" data-avoff>Desactivar</button></div></section>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.avon !== undefined) { e.stopPropagation(); return avEnable(); }
  if (d.avoff !== undefined) { e.stopPropagation(); return avDisable(); }
  if (d.avtest !== undefined) { e.stopPropagation(); return avTest(); }
  if (d.avk) { e.stopPropagation(); const P = avPrefs(); P[d.avk] = P[d.avk] === false; try { localStorage.setItem('caudal.avisos', JSON.stringify(P)); } catch (_) {} render(); return avSchedule(true); }
}, true);
