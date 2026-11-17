/* ---------- Avisos: notificaciones push programadas desde la app y enviadas por la función "avisos" ---------- */
const PUSH_PUB = 'BF6xos1DnlQP-4jMcs6M8OoBF_LeoTAqxKpZL0lMU6Ask0YH6AIbpoWjn5vmowwPHZFB2Gk34NetOy5-vUSt55U';
/* Cada tipo de aviso se puede prender, apagar y editar (hora, anticipación, días y, en los de texto fijo, el mensaje).
   Además hay recordatorios propios con título, mensaje, hora y repetición. Todo vive en S.settings.avisos
   ({ tipos:{ k:{...} }, propios:[...] }), que se sincroniza, así es igual en el celular y en el computador. */
const AV_KINDS = [
  ['recibos', 'Recibos por pagar', { on:true, h:'09:00', antes:0 }],
  ['tarjeta', 'Pago de la tarjeta', { on:true, h:'09:00', antes:2 }],
  ['diario', 'Repaso del día', { on:true, h:'20:00', dias:[0, 1, 2, 3, 4, 5, 6], titulo:'Repaso del día', texto:'Mira lo que registraste hoy.' }],
  ['mover', 'Traslados y por confirmar', { on:true, h:'19:00' }],
  ['cierre', 'Cierre del periodo', { on:true, h:'09:00', titulo:'Cerró tu periodo', texto:'Mira cómo te fue y qué ajustar del plan.' }],
  ['intereses', 'Intereses del mes', { on:true, h:'09:00' }],
  ['semanal', 'Resumen de la semana', { on:true, h:'08:30' }], /* lo envía el servidor (función semanal) los domingos; la hora es fija */
];
const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'], DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
let AV = { on:false, busy:false, msg:'' };
/* preferencias viejas de este celular (antes de que se guardaran en la nube): solo para no perderlas */
const avPrefs = () => { try { return JSON.parse(localStorage.getItem('caudal.avisos') || '{}'); } catch (_) { return {}; } };
const avConf = () => S.settings.avisos || {};
function avCfg(k){
  const def = (AV_KINDS.find(x => x[0] === k) || [])[2] || {}, viejo = avPrefs();
  const leg = { ...(viejo[k] === false ? { on:false } : {}), ...(k === 'diario' && viejo.hora ? { h:String(viejo.hora).padStart(2, '0') + ':00' } : {}) };
  return { ...def, ...leg, ...((avConf().tipos || {})[k] || {}) };
}
/* un aviso de Caudal se puede eliminar de la lista (borrado) y recuperar luego desde "+ Nuevo" */
const avBorrado = k => avCfg(k).borrado === true;
const avOn = k => !avBorrado(k) && avCfg(k).on !== false;
const avDeCaudal = () => AV_KINDS.filter(([k]) => k !== 'intereses' || S.settings.rate);
const avPropios = () => avConf().propios || [];
/* cambia la configuración y la guarda (save reprograma los avisos y sincroniza) */
function avGuardar(fn){ const c = JSON.parse(JSON.stringify(avConf())); c.tipos = c.tipos || {}; c.propios = c.propios || []; fn(c); S.settings.avisos = c; save(); render(); }
const hm = h => { const [a, b] = String(h || '09:00').split(':').map(Number); return [a || 0, b || 0]; };
const horaTxt = h => { const [a, b] = hm(h); return (a % 12 || 12) + ':' + String(b).padStart(2, '0') + (a < 12 ? ' a. m.' : ' p. m.'); };
const diasTxt = d => !d || d.length === 7 ? 'todos los días' : d.length === 5 && [1, 2, 3, 4, 5].every(x => d.includes(x)) ? 'de lunes a viernes' : d.slice().sort().map(x => DIAS_LARGOS[x]).join(', ');
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
  const atK = (d, k) => { const [h, m] = hm(avCfg(k).h); return at(d, h, m); };
  const add = (kind, when, title, body) => { if (when.getTime() > now + 60000) out.push({ id:kind + '-' + iso(when) + '-' + avHash(title), at:when.toISOString(), kind, title, body }); };
  const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return d; };
  if (avOn('recibos')) for (const b of (S.bills || []).filter(b => b.active !== false)) {
    const c = billCycle(b); if (c.cy.paid) continue;
    const R = avCfg('recibos');
    if (R.antes) { const pre = new Date(c.pay); pre.setDate(pre.getDate() - R.antes); add('recibos', atK(pre, 'recibos'), 'En ' + plural(R.antes, 'día', 'días') + ' toca pagar ' + b.name, (c.amount ? 'Cerca de ' + money(c.amount) + '. ' : '') + 'Ve separando la plata.'); }
    add('recibos', atK(c.pay, 'recibos'), 'Hoy toca pagar ' + b.name, (c.amount ? 'Cerca de ' + money(c.amount) + '. ' : '') + 'Vence el ' + c.due.getDate() + ' de ' + MESL[c.due.getMonth()] + '.');
    if (iso(c.due) !== iso(c.pay)) add('recibos', atK(c.due, 'recibos'), 'Vence hoy: ' + b.name, 'Si ya lo pagaste, márcalo en Caudal.');
  }
  if (avOn('tarjeta')) for (const a of S.accounts.filter(a => isCard(a) && !a.hidden && a.card.due)) {
    const B = balances(), debt = Math.max(0, -(B[a.id] || 0)), pk = cardPocket(a), have = B[pk] || 0, due = nextDay(a.card.due);
    if (debt > 0) {
      const left = have - debt, extra = left >= 0 ? 'Te sobran ' + money(left) + '.' : 'Te faltan ' + money(-left) + '.';
      const pre = new Date(due); pre.setDate(pre.getDate() - (avCfg('tarjeta').antes || 2));
      add('tarjeta', atK(pre, 'tarjeta'), 'Pagas la tarjeta el ' + due.getDate() + ' de ' + MESL[due.getMonth()], 'Debes ' + money(debt) + ' y en ' + accShort(pk) + ' tienes ' + money(have) + '. ' + extra);
      add('tarjeta', atK(due, 'tarjeta'), 'Hoy pagas la tarjeta', 'Debes ' + money(debt) + '. Al pagar, regístralo con "Pagar tarjeta".');
    }
  }
  if (avOn('diario')) { const D = avCfg('diario'); for (let n = 0; n < 7; n++) { const d = day(n); if ((D.dias || [0, 1, 2, 3, 4, 5, 6]).includes(d.getDay())) add('diario', atK(d, 'diario'), D.titulo || 'Repaso del día', D.texto || 'Mira lo que registraste hoy.'); } }
  if (avOn('mover')) {
    const mv = pendingMoves(), pend = S.transactions.filter(t => t.pending && t.type !== 'transferencia');
    if (mv.length) add('mover', atK(day(1), 'mover'), 'Tienes ' + (mv.length === 1 ? 'un traslado' : mv.length + ' traslados') + ' por mover', mv.slice(0, 2).map(t => money(t.amount) + ' de ' + accShort(t.accountId) + ' a ' + accShort(t.toAccountId)).join(' · '));
    if (pend.length) add('mover', atK(day(1), 'mover'), (pend.length === 1 ? 'Un valor' : pend.length + ' valores') + ' por confirmar', 'Corrígelos con lo que dice el banco para que tus cuentas cuadren.');
  }
  if (avOn('cierre')) { const p1 = period(1), C = avCfg('cierre'); add('cierre', atK(p1.start, 'cierre'), C.titulo || 'Cerró tu periodo', C.texto || 'Mira cómo te fue y qué ajustar del plan.'); }
  if (avOn('intereses') && S.settings.rate) { const d = new Date(), m = d.getDate() > INT_DIA || intHechos().length ? 1 : 0;
    add('intereses', atK(new Date(d.getFullYear(), d.getMonth() + m, INT_DIA), 'intereses'), 'Llegaron los intereses', 'Regístralos en Caudal con una captura de tus bolsillos.'); }
  /* recordatorios propios: una vez en su fecha; diarios y semanales en los próximos 14 días; mensuales, el próximo */
  for (const R of avPropios().filter(x => x.on !== false)) {
    const [h, m] = hm(R.h), k = 'propio-' + R.id, tit = R.titulo || 'Recordatorio', txt = R.texto || '';
    if (R.rep === 'una') { if (R.fecha) add(k, at(parseISO(R.fecha), h, m), tit, txt); }
    else if (R.rep === 'mes') { const d = new Date(), dia = Math.min(28, +R.dia || 1); let x = at(new Date(d.getFullYear(), d.getMonth(), dia), h, m); if (x.getTime() < now + 60000) x = at(new Date(d.getFullYear(), d.getMonth() + 1, dia), h, m); add(k, x, tit, txt); }
    else for (let n = 0; n < 14; n++) { const d = day(n); if (R.rep === 'diario' || (R.dias || []).includes(d.getDay())) add(k, at(d, h, m), tit, txt); }
  }
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

/* resumen de cada tipo, con su configuración */
function avResumen(k){
  const c = avCfg(k), h = horaTxt(c.h);
  if (k === 'recibos') return (c.antes ? plural(c.antes, 'día', 'días') + ' antes y el' : 'El') + ' día que toca pagar y el que vencen, ' + h;
  if (k === 'tarjeta') return plural(c.antes || 2, 'día', 'días') + ' antes y el día del pago, ' + h;
  if (k === 'diario') { const t = diasTxt(c.dias); return t[0].toUpperCase() + t.slice(1) + ', ' + h + ': lo que registraste ese día'; }
  if (k === 'mover') return 'Al día siguiente, ' + h + ', si quedó algo pendiente';
  if (k === 'cierre') return 'El primer día del periodo nuevo, ' + h;
  if (k === 'semanal') return 'Los domingos, 8:30 a. m.: cómo te fue en la semana';
  return 'El día ' + INT_DIA + ' de cada mes, ' + h;
}
const repTxt = R => { const t = R.rep === 'una' ? (R.fecha ? fmtShort(parseISO(R.fecha)) : 'Sin fecha') : R.rep === 'mes' ? 'El ' + (R.dia || 1) + ' de cada mes' : R.rep === 'diario' ? 'Todos los días' : diasTxt(R.dias); return t[0].toUpperCase() + t.slice(1); };
function pushCard(){
  let h = '<section class="card"><div class="card-h"><h2>Avisos</h2></div>';
  if (!pushCapable()) return h + '<p class="insight">Para recibir avisos en el iPhone, abre Caudal desde su ícono en la pantalla de inicio (no desde Safari) y vuelve a esta sección.</p></section>';
  if (!AV.on) h += '<p class="insight">Te llegan al celular aunque no abras la app. Actívalos y elige abajo cuáles quieres, a qué hora y con qué mensaje.</p>' +
    (AV.msg ? '<div class="err">' + esc(AV.msg) + '</div>' : '') + '<button class="btn accent block" data-avon' + (AV.busy ? ' disabled' : '') + '>' + (AV.busy ? 'Activando…' : 'Activar avisos') + '</button>';
  const fila = (i, attr, t, s, on, tog) => '<div class="set deuda"' + (i ? '' : ' style="border-top:0"') + '><button class="t" ' + attr + '><b>' + esc(t) + '</b><span>' + esc(s) + '</span></button><button class="pill" ' + tog + ' aria-pressed="' + on + '">' + (on ? 'Sí' : 'No') + '</button></div>';
  /* una sola lista: los que trae Caudal (mientras no los elimine) y los propios; todos se editan y se eliminan */
  const filas = avDeCaudal().filter(([k]) => !avBorrado(k)).map(([k, t]) => ['data-avedit="' + k + '"', (avCfg(k).titulo && avCfg(k).titulo !== ((AV_KINDS.find(x => x[0] === k) || [])[2] || {}).titulo) ? avCfg(k).titulo : t, avResumen(k), avOn(k), 'data-avk="' + k + '"'])
    .concat(avPropios().map(R => ['data-avpedit="' + esc(R.id) + '"', R.titulo || 'Recordatorio', repTxt(R) + ', ' + horaTxt(R.h), R.on !== false, 'data-avpk="' + esc(R.id) + '"']));
  h += '<div class="pgroup">Tus recordatorios<button class="lnk" data-avnuevo>+ Nuevo</button></div>' +
    (filas.length ? '<div>' + filas.map((f, i) => fila(i, ...f)).join('') + '</div><p class="note" style="padding:0">Toca uno para cambiarlo o eliminarlo.</p>'
      : '<p class="insight">No tienes recordatorios. Con <b>+ Nuevo</b> creas uno o recuperas los que trae Caudal.</p>');
  return h + (AV.on ? '<div class="two"><button class="btn ghost" data-avtest>Enviar prueba</button><button class="btn ghost" data-avoff>Desactivar</button></div>' : '') + '</section>';
}
/* ----- hojas de edición ----- */
let AVE = null;
const avNuevoPropio = () => ({ modo:'propio', nuevo:true, id:uid(), titulo:'', texto:'', h:'09:00', rep:'mes', dia:'', on:true });
const avDiasChips = sel => '<div class="chips">' + [1, 2, 3, 4, 5, 6, 0].map(d => '<button type="button" class="chip" data-aved="' + d + '" aria-pressed="' + sel.includes(d) + '" aria-label="' + DIAS_LARGOS[d] + '">' + DIAS_CORTOS[d] + '</button>').join('') + '</div>';
function avEditDraw(){
  const E = AVE, propio = E.modo === 'propio', k = E.k;
  const tit = propio ? (E.nuevo ? 'Nuevo recordatorio' : 'Editar recordatorio') : (AV_KINDS.find(x => x[0] === k) || [])[1];
  let h = '<div class="sheet-h"><b id="sheet-title">' + esc(tit) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form avedit">';
  h += '<button type="button" class="pill" style="align-self:flex-start" data-aveon aria-pressed="' + (E.on !== false) + '">' + (E.on !== false ? '● Activo' : '○ Apagado') + '</button>';
  if (propio || k === 'diario' || k === 'cierre') {
    const def = propio ? {} : (AV_KINDS.find(x => x[0] === k) || [])[2];
    h += '<div class="field"><label class="label" for="ave-tit">Título</label><input class="inp" id="ave-tit" value="' + esc(E.titulo || '') + '" placeholder="' + esc(def.titulo || 'Ej. Pagar el arriendo') + '" autocomplete="off"></div>' +
      '<div class="field"><label class="label" for="ave-txt">Mensaje</label><input class="inp" id="ave-txt" value="' + esc(E.texto || '') + '" placeholder="' + esc(def.texto || 'Opcional') + '" autocomplete="off"></div>';
  }
  if (k === 'semanal') h += '<p class="note" style="padding:0;margin:0">Llega los domingos a las 8:30 a. m., cuando usas el asistente. Puedes apagarlo o eliminarlo.</p>';
  else h += '<div class="field"><label class="label" for="ave-h">Hora</label><input class="inp" type="time" id="ave-h" value="' + esc(E.h || '09:00') + '"></div>';
  if (k === 'recibos') h += '<div class="field"><span class="label">Avisarte también antes</span><div class="chips">' + [[0, 'Solo ese día'], [1, '1 día antes'], [2, '2 días antes'], [3, '3 días antes'], [5, '5 días antes']].map(([v, t]) => '<button type="button" class="chip" data-aveantes="' + v + '" aria-pressed="' + ((E.antes || 0) === v) + '">' + t + '</button>').join('') + '</div></div>';
  if (k === 'tarjeta') h += '<div class="field"><span class="label">¿Cuántos días antes del pago?</span><div class="chips">' + [1, 2, 3, 5, 7].map(v => '<button type="button" class="chip" data-aveantes="' + v + '" aria-pressed="' + ((E.antes || 2) === v) + '">' + plural(v, 'día', 'días') + '</button>').join('') + '</div></div>';
  if (k === 'diario') h += '<div class="field"><span class="label">¿Qué días?</span>' + avDiasChips(E.dias || [0, 1, 2, 3, 4, 5, 6]) + '</div>';
  if (propio) {
    h += '<div class="field"><span class="label">¿Cuándo?</span><div class="chips">' + [['una', 'Una vez'], ['diario', 'Todos los días'], ['semana', 'Algunos días'], ['mes', 'Cada mes']].map(([v, t]) => '<button type="button" class="chip" data-averep="' + v + '" aria-pressed="' + (E.rep === v) + '">' + t + '</button>').join('') + '</div></div>';
    if (E.rep === 'una') h += '<div class="field"><label class="label" for="ave-fecha">Fecha</label><input class="inp" type="date" id="ave-fecha" value="' + esc(E.fecha || iso(new Date())) + '"></div>';
    if (E.rep === 'semana') h += '<div class="field"><span class="label">¿Qué días?</span>' + avDiasChips(E.dias || []) + '</div>';
    if (E.rep === 'mes') h += '<div class="field"><label class="label" for="ave-dia">Día del mes</label><input class="inp num" id="ave-dia" inputmode="numeric" maxlength="2" value="' + esc(String(E.dia || '')) + '" placeholder="Del 1 al 28"></div>';
  }
  h += '<div class="err" id="ave-err"></div><button class="btn accent block" type="button" data-avego>Guardar</button>';
  if (!E.nuevo) h += '<button class="btn block ' + (E.del ? 'danger' : 'ghost') + '" type="button" data-avedel>' + (E.del ? 'Toca otra vez para eliminar' : 'Eliminar recordatorio') + '</button>' +
    (propio ? '' : '<p class="note" style="padding:0;margin:0">Si lo eliminas, lo recuperas cuando quieras desde + Nuevo.</p>');
  if (!propio && (k === 'diario' || k === 'cierre')) h += '<button class="btn block ghost" type="button" data-avereset>Volver al mensaje de Caudal</button>';
  h += '</div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
const aveLeer = () => { const v = id => { const el = $('#ave-' + id); return el ? el.value.trim() : null; };
  for (const [id, key] of [['tit', 'titulo'], ['txt', 'texto'], ['h', 'h'], ['fecha', 'fecha'], ['dia', 'dia']]) { const x = v(id); if (x !== null) AVE[key] = x; } };
function avEditGuardar(){
  const E = AVE, err = m => { $('#ave-err').textContent = m; };
  if (!/^\d{2}:\d{2}$/.test(E.h || '')) return err('Elige la hora.');
  if (E.modo === 'propio') {
    if (!E.titulo) return err('Escribe el título del recordatorio.');
    if (E.rep === 'semana' && !(E.dias || []).length) return err('Elige al menos un día.');
    if (E.rep === 'mes' && !(+E.dia >= 1 && +E.dia <= 28)) return err('El día va del 1 al 28.');
    if (E.rep === 'una' && !E.fecha) return err('Elige la fecha.');
    const R = { id:E.id, titulo:E.titulo, texto:E.texto || '', h:E.h, rep:E.rep, on:E.on !== false,
      ...(E.rep === 'una' ? { fecha:E.fecha } : {}), ...(E.rep === 'semana' ? { dias:E.dias } : {}), ...(E.rep === 'mes' ? { dia:+E.dia } : {}) };
    avGuardar(c => { const i = c.propios.findIndex(x => x.id === R.id); if (i >= 0) c.propios[i] = R; else c.propios.push(R); });
  } else {
    if (E.k === 'diario' && !(E.dias || []).length) return err('Elige al menos un día.');
    const { modo, k, nuevo, del, borrado, ...cfg } = E;
    avGuardar(c => { c.tipos[k] = cfg; });
  }
  AVE = null; closeSheet(); toast('Aviso guardado');
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.avon !== undefined) { e.stopPropagation(); return avEnable(); }
  if (d.avoff !== undefined) { e.stopPropagation(); return avDisable(); }
  if (d.avtest !== undefined) { e.stopPropagation(); return avTest(); }
  if (d.avk) { e.stopPropagation(); const k = d.avk, on = !avOn(k); return avGuardar(c => { c.tipos[k] = { ...avCfg(k), on }; }); }
  if (d.avpk) { e.stopPropagation(); return avGuardar(c => { const R = c.propios.find(x => x.id === d.avpk); if (R) R.on = R.on === false; }); }
  if (d.avedit) { e.stopPropagation(); AVE = { modo:'tipo', k:d.avedit, ...JSON.parse(JSON.stringify(avCfg(d.avedit))) };
    const def = (AV_KINDS.find(x => x[0] === d.avedit) || [])[2]; if (AVE.titulo === def.titulo) delete AVE.titulo; if (AVE.texto === def.texto) delete AVE.texto; return avEditDraw(); }
  if (d.avnuevo !== undefined) { e.stopPropagation(); const rec = avDeCaudal().filter(([k]) => avBorrado(k));
    if (!rec.length) { AVE = avNuevoPropio(); return avEditDraw(); }
    return openSheet('<div class="sheet-h"><b id="sheet-title">Nuevo recordatorio</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
      '<button class="btn accent block" type="button" data-avpedit="">Crear uno propio</button>' +
      '<div class="pgroup">O recupera uno de Caudal</div><div>' + rec.map(([k, t], i) => '<div class="set deuda"' + (i ? '' : ' style="border-top:0"') + '><div class="t"><b>' + t + '</b><span>' + avResumen(k) + '</span></div><button class="pill" data-avrest="' + k + '">Agregar</button></div>').join('') + '</div></div>'); }
  if (d.avrest) { e.stopPropagation(); const k = d.avrest; closeSheet(); avGuardar(c => { c.tipos[k] = { ...((c.tipos || {})[k] || {}), borrado:false, on:true }; }); return toast('Recordatorio agregado'); }
  if (d.avpedit !== undefined) { e.stopPropagation(); const R = avPropios().find(x => x.id === d.avpedit);
    AVE = R ? { modo:'propio', ...JSON.parse(JSON.stringify(R)) } : avNuevoPropio(); return avEditDraw(); }
  if (!AVE || !el.closest('.avedit')) return;
  e.stopPropagation(); aveLeer();
  if (d.aveon !== undefined) { AVE.on = AVE.on === false; return avEditDraw(); }
  if (d.aveantes !== undefined) { AVE.antes = +d.aveantes; return avEditDraw(); }
  if (d.aved !== undefined) { const x = +d.aved, l = (AVE.dias || (AVE.k === 'diario' ? [0, 1, 2, 3, 4, 5, 6] : [])).slice(), i = l.indexOf(x); if (i >= 0) l.splice(i, 1); else l.push(x); AVE.dias = l; return avEditDraw(); }
  if (d.averep) { AVE.rep = d.averep; return avEditDraw(); }
  if (d.avereset !== undefined) { delete AVE.titulo; delete AVE.texto; return avEditDraw(); }
  if (d.avedel !== undefined) { if (!AVE.del) { AVE.del = true; return avEditDraw(); }
    const E = AVE; AVE = null; closeSheet();
    avGuardar(c => { if (E.modo === 'propio') c.propios = c.propios.filter(x => x.id !== E.id); else c.tipos[E.k] = { ...((c.tipos || {})[E.k] || {}), borrado:true }; });
    return toast('Recordatorio eliminado'); }
  if (d.avego !== undefined) return avEditGuardar();
}, true);
