/* Vista Asistente (chat con tus gastos y herramientas de la IA) y guía de atajos del iPhone. */
/* ----- vista Asistente: todo lo de la IA en un lugar (resumen del día, revisión y cierre, guardados) y el chat ----- */
function vAsistente(){
  const head = '<div class="hello"><h1>Tu <em>asistente</em></h1><p>Lo que pide tu atención hoy y una conversación sobre tu plata</p></div>';
  /* Para hoy no usa IA: se ve siempre. La conversación y el cierre sí la necesitan */
  if (!aiOn() || S.demo) return head + paraHoyCard() + '<section class="card"><p class="insight">La conversación funciona cuando inicias sesión con tu cuenta. Tus datos de ejemplo no se le envían.</p></section>';
  return head + paraHoyCard() + chatCard() + aiCard();
}

/* ----- chat con tus gastos, como en Monai: un solo campo para preguntar o registrar.
   "almuerzo 25 mil y taxi 12" se guarda de una (con Deshacer); una pregunta va a la IA, que responde corto
   y, si hay cifras que comparar, con una tarjeta de informe (barras o cifras clave) que Caudal dibuja.
   La conversación se guarda en este dispositivo. El contexto grande va en caché y de la charla solo viajan
   los mensajes recientes, para que cada pregunta no salga más cara. ----- */
const ASK_GUARDA = 40, ASK_RATO = 6 * 3600e3;
const askLeer = () => { try { const m = JSON.parse(lsGet('chat') || '[]'); return Array.isArray(m) ? m : []; } catch (_) { return []; } };
let ASK = { msgs:askLeer(), busy:false, ctx:'', at:0 }, ASK_REC = null;
const askGuardar = () => lsSet('chat', JSON.stringify(ASK.msgs.slice(-ASK_GUARDA)));
/* lo que se manda a la IA: solo la conversación (sin los registros), 8 mensajes si está viva y 4 si se retoma,
   siempre empezando por una pregunta */
function askVentana(){
  const m = ASK.msgs.filter(x => !x.reg && (x.role === 'user' || x.role === 'assistant')), prev = m[m.length - 2], viva = prev && prev.ts && Date.now() - prev.ts < ASK_RATO;
  let v = m.slice(viva ? -8 : -4); while (v.length && v[0].role !== 'user') v = v.slice(1);
  return v.map(({ role, content }) => ({ role, content }));
}
const ASK_EX = ['¿En qué gasté más este periodo?', '¿Cómo voy contra el plan?', 'Compara mis gastos con el periodo anterior', '¿Me alcanza para un gasto de 500 mil?', 'almuerzo 25 mil y taxi 12'];
function chatSystem(){
  return 'Eres el asistente financiero personal de ' + userName() + ', en Bogotá. Conversas con él sobre su plata: respondes, recomiendas y le ayudas a decidir. Español de Colombia, directo y cálido, sin la raya larga. Cifras como $1.234.567.\n' +
    'Reglas: usa solo los datos de abajo. Las sumas y promedios ya están calculados: úsalos tal cual. Si algo no se puede saber con estos datos, dilo. Sé breve: máximo 4 frases o una lista corta, salvo que pida detalle. ' +
    'Cuando ayude, compara con periodos anteriores, con el plan o con sus metas, y termina con una recomendación concreta. Si te pide decidir algo (comprar, mover plata, cambiar el plan), di qué harías tú y por qué, con números. Puedes usar **negrita** y viñetas con "- ".\n' +
    'Informe: si la respuesta tiene cifras para comparar (categorías, periodos, cuentas, plan contra real), agrega al final UN bloque y nada después:\n' +
    '```informe\n{"titulo":"Gasto por categoría","series":["Este periodo","Anterior"],"filas":[{"n":"Comida","v":350000,"v2":280000}],"total":true}\n```\n' +
    'o, para pocas cifras clave sin comparar: ```informe\n{"titulo":"Tu periodo","cifras":[{"n":"Gastado","v":1200000},{"n":"Disponible","v":800000}]}\n```\n' +
    'Valores en pesos enteros, máximo 8 filas de mayor a menor; "series" y "v2" solo si comparas dos cosas; "total" solo si sumar tiene sentido. Con informe, el texto no repite las cifras: da la conclusión y la recomendación. Sin cifras que mostrar, no lo agregues.\n' +
    APR_CHAT + perfilBlock() + metasBlock() + '\n' + askContext();
}

/* separa el texto del bloque de informe que manda la IA; si el bloque viene dañado, se ignora */
function informeDe(content){
  const m = String(content || '').match(/```informe\s*([\s\S]*?)```/); let inf = null;
  if (m) { try { inf = JSON.parse(m[1]); } catch (_) {} }
  const txt = String(content || '').replace(/```informe[\s\S]*?(```|$)/, '').trim();
  return { txt, inf:inf && (Array.isArray(inf.filas) || Array.isArray(inf.cifras)) ? inf : null };
}
/* tarjeta de informe: barras horizontales (con la comparación debajo) o cifras clave */
function informeHTML(inf){
  const num = v => Math.round(+v || 0);
  if (inf.cifras) return '<div class="inf">' + (inf.titulo ? '<b class="inf-t">' + esc(inf.titulo) + '</b>' : '') + '<div class="inf-c">' +
    inf.cifras.slice(0, 6).map(c => '<div><span>' + esc(c.n || '') + '</span><b class="num">' + money(num(c.v)) + '</b></div>').join('') + '</div></div>';
  const filas = inf.filas.slice(0, 8), dos = filas.some(f => f.v2 != null), max = Math.max(1, ...filas.map(f => Math.max(num(f.v), num(f.v2))));
  const ser = inf.series || [], barra = (v, i) => '<i style="width:' + Math.max(2, num(v) / max * 100) + '%;background:' + serieColor(i) + '"></i>';
  const tot = k => filas.reduce((a, f) => a + num(f[k]), 0);
  return '<div class="inf">' + (inf.titulo ? '<b class="inf-t">' + esc(inf.titulo) + '</b>' : '') +
    (dos && ser.length ? '<div class="inf-ley">' + ser.slice(0, 2).map((x, i) => '<span><i style="background:' + serieColor(i) + '"></i>' + esc(x) + '</span>').join('') + '</div>' : '') +
    filas.map(f => '<div class="inf-f"><div class="inf-n"><span>' + esc(f.n || '') + '</span><b class="num">' + money(num(f.v)) + (dos && f.v2 != null ? '<small> / ' + money(num(f.v2)) + '</small>' : '') + '</b></div>' +
      '<div class="inf-b">' + barra(f.v, 0) + (dos && f.v2 != null ? barra(f.v2, 1) : '') + '</div></div>').join('') +
    (inf.total ? '<div class="inf-tot"><span>Total</span><b class="num">' + money(tot('v')) + (dos ? '<small> / ' + money(tot('v2')) + '</small>' : '') + '</b></div>' : '') + '</div>';
}
/* tarjeta de lo que se registró desde el chat: cada movimiento abre su edición; Deshacer lo borra */
function regHTML(m, k){
  const txs = (m.ids || []).map(id => S.transactions.find(t => t.id === id)).filter(Boolean);
  if (m.undone || !txs.length) return '<div class="msg ai reg muted">Registro deshecho.</div>';
  const n = txs.length;
  return '<div class="msg ai reg"><b class="reg-t">✓ ' + (n === 1 ? 'Registré 1 movimiento' : 'Registré ' + n + ' movimientos') + '</b>' +
    txs.map(t => { const c = cat(t.categoryId), ti = TIPOS[t.type];
      return '<button class="reg-f" data-tx="' + esc(t.id) + '"><span class="ico sm">' + (c ? esc(c.emoji) : tipoIcono(t.type, 16)) + '</span><span class="reg-d"><b>' + esc(t.note || (c ? c.name : ti.nombre)) + '</b><small>' + esc((c ? c.name : ti.nombre) + ' · ' + accShort(t.accountId) + (t.date !== iso(new Date()) ? ' · ' + diaMes(parseISO(t.date)) : '')) + '</small></span>' +
        '<b class="num' + (t.type === 'ingreso' ? ' pos' : '') + '">' + ti.signo + money(t.amount) + '</b></button>'; }).join('') +
    (m.aviso ? '<p class="reg-a">' + esc(m.aviso) + '</p>' : '') +
    '<div class="reg-x"><span>Toca uno para corregirlo</span><button class="pill" data-askundo="' + k + '">Deshacer</button></div></div>';
}
function msgHTML(m, k){
  if (m.role === 'reg') return regHTML(m, k);
  if (m.role === 'user') return '<div class="msg me">' + esc(m.content) + '</div>';
  const { txt, inf } = informeDe(m.content);
  return '<div class="msg ai">' + (txt ? mdLite(txt) : '') + (inf ? informeHTML(inf) : '') + ttsBtn('msg' + k, txt) + '</div>';
}
function chatCard(){
  const ms = ASK.msgs.slice(-ASK_GUARDA), base = ASK.msgs.length - ms.length;
  const auto = ttsOk() ? '<button class="pill" data-ttsauto aria-pressed="' + TTS.auto + '" title="Leer las respuestas en voz alta">' + ICO_SPK + (TTS.auto ? ' Voz' : '') + '</button>' : '';
  return '<section class="card glow chat chatv"><div class="card-h"><h2>Conversa</h2><span class="hbtns">' + auto + (ASK.msgs.length ? '<button class="pill" data-asknew>Nueva</button>' : '') + '</span></div>' +
    (ms.length ? '<div class="chat-log" id="ask-out">' + ms.map((m, k) => msgHTML(m, base + k)).join('') + (ASK.busy ? '<div class="msg ai muted">' + esc(ASK.busy === 'reg' ? 'Registrando…' : 'Pensando…') + '</div>' : '') + '</div>'
      : '<p class="insight" style="margin:0">Pregúntale por tu plata o cuéntale un gasto y lo registro de una. Si le cuentas cómo manejas algo, lo aprende.</p><div class="pills">' + ASK_EX.map((x, i) => '<button class="pill" data-askex="' + i + '">' + esc(x) + '</button>').join('') + '</div>') +
    '<form class="ask askfix" id="askf"><button type="button" class="ask-mic' + (ASK_REC ? ' rec' : '') + '" data-askmic aria-label="' + (ASK_REC ? 'Detener dictado' : 'Dictar') + '">' + MIC + '</button>' +
    '<input class="ask-in" id="ask-q" placeholder="' + (ASK_REC ? 'Escuchando…' : 'Pregunta o registra') + '" autocomplete="off" aria-label="Tu mensaje">' +
    '<button class="ask-ic" type="submit" aria-label="Enviar"' + (ASK.busy ? ' disabled' : '') + '><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form></section>';
}

/* ¿registrar o preguntar? Una pregunta o una instrucción para el asistente va a la IA; un texto con montos
   que no lo es ("almuerzo 25 mil y taxi 12", "me pagaron 4 millones") se registra */
const ASK_PREG = /\?|^\s*(cu[aá]nt|c[oó]mo|qu[eé]|cu[aá]l|d[oó]nde|cu[aá]ndo|por ?qu[eé]|para qu[eé]|me alcanza|alcanza|puedo|deber[ií]a|dame|dime|mu[eé]strame|muestra|compara|resume|explica|ayuda|analiza|revisa|recomi|sugi|ten en cuenta|recuerda|aprende|siempre|nunca|normalmente|cada mes|todos los|si |hola|gracias)/i;
const esRegistro = q => !ASK_PREG.test(norm(q).replace(/^¿/, '')) && !/\?/.test(q) && localParse(q).length > 0;

async function askRegistrar(q){
  let items = localParse(q);
  if (items.some(i => i.type !== 'transferencia' && !i.categoryId)) { try { const r = await aiParse(q, []); if (r.length) items = r; } catch (_) {} }
  items = items.filter(i => i.amount && (i.type === 'transferencia' ? i.toAccountId && i.toAccountId !== i.accountId : i.categoryId));
  if (!items.length) return { role:'assistant', content:'No pude armar ese registro solo. Ábrelo en Registrar con IA para revisarlo.', ts:Date.now() };
  const hechos = guardarItems(items); save();
  const aviso = hechos.map(budgetMsg).filter(Boolean).join(' · ');
  return { role:'reg', ids:hechos.map(t => t.id), aviso, ts:Date.now() };
}
async function ask(q){
  q = String(q || '').trim();
  if (!aiOn() || ASK.busy || !q) return;
  if (TTS.auto) ttsUnlock();
  if (ui.view !== 'asistente') ui.view = 'asistente';
  /* si la última charla quedó atrás (más de 6 horas), se empieza una nueva en vez de seguir acumulando */
  const ult = ASK.msgs[ASK.msgs.length - 1];
  if (ult && (!ult.ts || Date.now() - ult.ts > ASK_RATO)) ASK.msgs = [];
  const reg = esRegistro(q);
  ASK.msgs.push({ role:'user', content:q, ts:Date.now(), ...(reg ? { reg:true } : {}) }); ASK.busy = reg ? 'reg' : 'ia'; askGuardar(); render(); askScroll();
  if (reg) { ASK.msgs.push(await askRegistrar(q)); ASK.busy = false; askGuardar(); render(); askScroll(); return; }
  /* el contexto se arma una vez por conversación para que la caché lo reconozca igualito; se renueva tras 30 minutos */
  if (!ASK.ctx || Date.now() - ASK.at > 30 * 60000 || ASK.msgs.length === 1) { ASK.ctx = chatSystem(); ASK.at = Date.now(); }
  try {
    let text;
    if (SAMPLE) { const flat = ASK.ctx + '\n\n' + askVentana().map(m => (m.role === 'user' ? 'Usuario: ' : 'Asistente: ') + m.content).join('\n'); text = (await SAMPLE(flat, { cache:false })).text; }
    else text = await iaCall(q, false, null, 'chat', { cache:ASK.ctx, messages:askVentana() });
    ASK.msgs.push({ role:'assistant', content:aprDeTexto(text), ts:Date.now() });
  } catch (e) { ASK.msgs.push({ role:'assistant', content:e.text || aiErr(e), ts:Date.now() }); }
  ASK.busy = false; askGuardar(); if (ui.view === 'asistente') { render(); askScroll(); }
  if (TTS.auto) { const k = ASK.msgs.length - 1; ttsSpeak('msg' + k, informeDe(ASK.msgs[k].content).txt); }
}
/* dictado: al terminar de hablar se envía solo; si el navegador no deja, se usa el micrófono del teclado */
function askVoz(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, inp = $('#ask-q');
  if (ASK_REC) { try { ASK_REC.stop(); } catch (_) {} return; }
  if (!SR) { if (inp) inp.focus(); return toast('Usa el micrófono de tu teclado para dictar'); }
  try {
    const r = new SR(); r.lang = 'es-CO'; r.interimResults = true; r.continuous = false; let oido = '';
    r.onresult = e => { oido = Array.from(e.results).map(x => x[0].transcript).join(' '); const i = $('#ask-q'); if (i) i.value = oido; };
    r.onerror = () => { ASK_REC = null; render(); };
    r.onend = () => { ASK_REC = null; render(); if (oido.trim()) ask(oido); };
    ASK_REC = r; r.start(); render();
  } catch (_) { ASK_REC = null; if (inp) inp.focus(); }
}
/* baja hasta el último mensaje: la conversación vive en su propio espacio con scroll */
function askScroll(){ requestAnimationFrame(() => { const l = document.getElementById('ask-out'); if (l) l.scrollTop = l.scrollHeight; const f = document.getElementById('askf'); if (f) f.scrollIntoView({ block:'end' }); const i = document.getElementById('ask-q'); if (i && isDesk()) i.focus(); }); }
document.addEventListener('click', e => {
  if (e.target.closest('[data-asknew]')) { e.stopPropagation(); ASK = { msgs:[], busy:false, ctx:'', at:0 }; askGuardar(); return render(); }
  if (e.target.closest('[data-askmic]')) { e.stopPropagation(); return askVoz(); }
  const u = e.target.closest('[data-askundo]'); if (u) { e.stopPropagation(); const m = ASK.msgs[+u.dataset.askundo]; if (!m || m.undone) return;
    txBorrar(m.ids || []); m.undone = true; save(); askGuardar(); render(); return toast('Registro deshecho'); }
}, true);
document.addEventListener('click', e => { const b = e.target.closest('button[data-v="asistente"], [data-go="asistente"]'); if (b && ASK.msgs.length) setTimeout(askScroll, 60); });

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
