/* Chat con tus gastos y guía de atajos del iPhone. */
/* ----- chat con tus gastos: conversación con memoria; el contexto va de primero y se reutiliza en caché ----- */
let ASK = { msgs:[], busy:false, ctx:'', at:0 };
const ASK_EX = ['¿En qué gasté más este periodo que el anterior?', '¿Cómo voy con mis metas?', '¿Qué gastos podría recortar sin sufrir?', '¿Me alcanza para un gasto de 500 mil este mes?'];
function chatSystem(){
  return 'Eres el asistente financiero personal de ' + userName() + ', en Bogotá. Conversas con él sobre su plata: respondes, recomiendas y le ayudas a decidir. Español de Colombia, directo y cálido, sin la raya larga. Cifras como $1.234.567.\n' +
    'Reglas: usa solo los datos de abajo. Las sumas y promedios ya están calculados: úsalos tal cual. Si algo no se puede saber con estos datos, dilo. Respuestas cortas (máximo 8 frases o una lista corta) salvo que pida detalle. ' +
    'Cuando ayude, compara con periodos anteriores, con el plan o con sus metas, y termina con una recomendación concreta. Si te pide decidir algo (comprar, mover plata, cambiar el plan), di qué harías tú y por qué, con números. Puedes usar **negrita** y viñetas con "- ".\n' +
    APR_CHAT + perfilBlock() + metasBlock() + memoriaBlock() + '\n' + askContext();
}
function askCard(){
  if (!aiOn()) return '';
  const last = ASK.msgs.slice(-8);
  const auto = ttsOk() ? '<button class="pill" data-ttsauto aria-pressed="' + TTS.auto + '" title="Leer las respuestas en voz alta">' + ICO_SPK + (TTS.auto ? ' Voz' : '') + '</button>' : '';
  return '<section class="card glow chat"><div class="card-h"><h2>Habla con tu asistente</h2><span class="hbtns">' + auto + (ASK.msgs.length ? '<button class="pill" data-asknew>Nueva</button>' : '') + '</span></div>' +
    (last.length ? '<div class="chat-log" id="ask-out">' + last.map((m, k) => '<div class="msg ' + (m.role === 'user' ? 'me' : 'ai') + '">' + (m.role === 'user' ? esc(m.content) : mdLite(m.content) + ttsBtn('msg' + (ASK.msgs.length - last.length + k), m.content)) + '</div>').join('') + (ASK.busy ? '<div class="msg ai muted">Pensando…</div>' : '') + '</div>' : '') +
    '<form class="ask" id="askf" style="margin:0"><input class="ask-in" id="ask-q" placeholder="' + (ASK.msgs.length ? 'Sigue la conversación…' : '¿Cuánto gasté en domicilios?') + '" autocomplete="off" aria-label="Tu mensaje"><button class="ask-ic" type="submit" aria-label="Enviar"' + (ASK.busy ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>' +
    (ASK.msgs.length ? '' : '<div class="pills">' + ASK_EX.map((x, i) => '<button class="pill" data-askex="' + i + '">' + esc(x) + '</button>').join('') + '</div>') + '</section>';
}
async function ask(q){
  if (!aiOn() || ASK.busy || !q.trim()) return;
  /* el contexto se arma una vez por conversación para que la caché lo reconozca igualito; se renueva tras 30 minutos */
  if (!ASK.ctx || Date.now() - ASK.at > 30 * 60000) { ASK.ctx = chatSystem(); ASK.at = Date.now(); }
  if (TTS.auto) ttsUnlock();
  ASK.msgs.push({ role:'user', content:q.trim() }); ASK.busy = true; render(); askScroll();
  try {
    let text;
    if (SAMPLE) { const flat = ASK.ctx + '\n\n' + ASK.msgs.map(m => (m.role === 'user' ? 'Usuario: ' : 'Asistente: ') + m.content).join('\n'); text = (await SAMPLE(flat, { cache:false })).text; }
    else text = await iaCall(q.trim(), false, null, 'chat', { cache:ASK.ctx, messages:ASK.msgs.slice(-12) });
    ASK.msgs.push({ role:'assistant', content:aprDeTexto(text) });
  } catch (e) { ASK.msgs.push({ role:'assistant', content:e.text || aiErr(e) }); }
  ASK.busy = false; if (ui.view === 'analisis') { render(); askScroll(); }
  if (TTS.auto) { const k = ASK.msgs.length - 1; ttsSpeak('msg' + k, ASK.msgs[k].content); }
}
function askScroll(){ requestAnimationFrame(() => { const o = document.getElementById('ask-out'); if (o) o.scrollTop = o.scrollHeight; const i = document.getElementById('ask-q'); if (i && isDesk()) i.focus(); }); }
document.addEventListener('click', e => { if (!e.target.closest('[data-asknew]')) return; e.stopPropagation(); ASK = { msgs:[], busy:false, ctx:'', at:0 }; render(); }, true);

/* ----- atajos del iPhone (guía) ----- */
function shortcutsCard(){
  const base = /claude|localhost|^file/.test(location.href) ? 'https://TU-ENLACE/caudal/' : location.origin + location.pathname;
  const step = (t, d) => '<details class="howto"><summary>' + t + '</summary><div>' + d + '</div></details>';
  return '<section class="card"><div class="card-h"><h2>Registro automático</h2>' + SPARK + '</div>' +
    '<p class="insight">Atajos del iPhone que mandan tus movimientos a Caudal sin escribirlos. Todos llegan a <b>Por revisar</b> para que confirmes con un toque.</p>' +
    step('Al pagar con Apple Pay', 'Atajos → Automatización → Nueva → <b>Transacción</b> → elige tus tarjetas → <b>Ejecutar de inmediato</b>. Acción <b>Abrir URL</b>:<code>' + esc(base) + '?monto=[Importe]&amp;comercio=[Comercio]&amp;tarjeta=[Tarjeta]</code>') +
    step('Con el SMS del banco', 'Automatización → <b>Mensaje</b> → "El mensaje contiene" Bancolombia, Lulo o Nequi → Ejecutar de inmediato. Acciones: <b>Codificar URL</b> (Contenido del mensaje) y <b>Abrir URL</b>:<code>' + esc(base) + '?n=[URL codificada]</code>') +
    step('Con el correo del banco', 'Automatización → <b>Correo</b> → remitente de tu banco. Igual que el SMS, usando el cuerpo del correo.') +
    step('“Oye Siri, anota un gasto”', 'Crea un atajo llamado <b>Anota un gasto</b> con <b>Dictar texto</b> → <b>Codificar URL</b> → <b>Abrir URL</b>:<code>' + esc(base) + '?t=[URL codificada]</code>Di "Oye Siri, anota un gasto" y luego "almuerzo 25 mil con Wallet".') +
    step('Ícono de gasto rápido', 'Agrega el atajo de Siri a la pantalla de inicio o al botón de acción del iPhone para dictar con un toque.') +
    '<p class="note" style="padding:0">Los atajos funcionan cuando la app esté alojada en tu propio enlace (siguiente paso). Las notificaciones de las apps de los bancos no se pueden leer en iPhone; los SMS, correos y Apple Pay sí. Mientras tanto, prueba el lector pegando una notificación en <b>Registrar con IA</b>.</p>' +
    '<button class="btn ghost block" data-smart="banco">Probar con una notificación</button></section>';
}
