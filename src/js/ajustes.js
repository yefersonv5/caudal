/* Ajustes: secciones, buscador y navegación entre ellas. */
const SI = p => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
const SET_SECS = [
  { id:'general', t:'General', k:'nombre saludo periodo mes sueldo salario dia inicio corte',
    i:SI('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
    s:() => (S.settings.periodMode === 'sueldo' ? 'Periodo según tu sueldo' : 'Periodo desde el día ' + S.settings.startDay) },
  { id:'recibos', t:'Recibos y pagos fijos', k:'recibos servicios luz agua gas internet vencimiento vence recordatorio rendimiento pagos programados arriendo suscripciones nomina',
    i:SI('<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
    s:() => { const bs = (S.bills || []).filter(b => b.active !== false); if (!bs.length) return 'Aún no tienes recibos'; const n = bs.map(b => ({ b, c:billCycle(b) })).filter(x => !x.c.cy.paid).sort((x, y) => x.c.pay - y.c.pay)[0];
      return bs.length + (bs.length === 1 ? ' recibo' : ' recibos') + (n ? ' · ' + n.b.name + ': ' + n.c.label.toLowerCase() : ' · todo pagado'); } },
  { id:'avisos', t:'Avisos', k:'notificaciones push recordatorio hora repaso tarjeta celular alertas',
    i:SI('<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21a2 2 0 0 0 4 0"/>'),
    s:() => typeof AV !== 'undefined' && AV.on ? 'Activados en este celular' : 'Desactivados' },
  { id:'presupuesto', t:'Presupuesto y categorías', k:'presupuesto limite categorias subcategoria meta ingresos plan nueva categoria',
    i:SI('<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'),
    s:() => S.categories.filter(c => !c.hidden).length + ' categorías' + ((S.plans || []).length ? ' · límites en tu Plan' : '') },
  { id:'asistente', t:'Asistente con IA', k:'ia inteligencia artificial perfil creditos consumo claude saldo lo que debe saber',
    i:SI('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>'),
    show:() => !!iaCard(), s:() => 'Lo que sabe de ti y cuánto gasta' },
  { id:'atajos', t:'Registro automático', k:'atajos iphone apple pay sms correo siri llave direccion banco notificacion',
    i:SI('<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'), s:() => 'Atajos del iPhone, Apple Pay y SMS' },
  { id:'cuenta', t:'Cuenta y nube', k:'nube supabase sesion cerrar sincronizar correo cuenta entrar salir',
    i:SI('<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.2 10.5 3.75 3.75 0 0 0 7 18z"/>'),
    show:() => typeof sb !== 'undefined' && !!sb, s:() => typeof session !== 'undefined' && session ? (session.user.email || 'Sesión iniciada') : 'Solo en este dispositivo' },
  { id:'datos', t:'Datos y respaldos', k:'respaldo backup copia importar money manager json icloud restaurar pegar descargar borrar empezar de cero',
    i:SI('<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'),
    s:() => nf.format(S.transactions.length) + ' movimientos · ' + backupAge().split('.')[0].replace('Archivo con todos tus datos', 'sin respaldo descargado') },
];
const setSecs = () => SET_SECS.filter(x => !x.show || x.show());
function setSecBody(id){
  if (id === 'general') { const sm = S.settings.periodMode === 'sueldo', sc = salaryCat(), p0 = period(0);
    return '<section class="card"><div class="card-h"><h2>Tú</h2></div><div><div class="set" style="border-top:0"><div class="t"><b>Tu nombre</b><span>Para el saludo de inicio.</span></div><input type="text" id="uname" value="' + esc(userName()) + '" autocomplete="off" aria-label="Tu nombre"></div></div></section>' +
      '<section class="card"><div class="card-h"><h2>Periodo</h2></div><div>' +
      '<div class="set" style="border-top:0"><div class="t"><b>Empieza cuando llega el sueldo</b><span>' + (sm ? (sc ? 'Cada periodo arranca el día en que registras un ingreso en ' + esc(sc.name) + '. El actual va desde el ' + fmtShort(p0.start) + (p0.start.getFullYear() === new Date().getFullYear() ? '' : ' de ' + p0.start.getFullYear()) + ' y sigue abierto hasta el próximo sueldo.' : 'Crea una categoría de ingreso llamada Salario o Sueldo para usar este modo.') : 'Si lo activas, no importa si te pagan el 25 o el 30: el periodo se ajusta solo al día en que registras el sueldo.') + '</span></div><button class="pill" data-pmode aria-pressed="' + sm + '" aria-label="Periodo según el sueldo">' + (sm ? 'Sí' : 'No') + '</button></div>' +
      '<div class="set"><div class="t"><b>' + (sm ? 'Día de respaldo' : 'Día de inicio del mes') + '</b><span>' + (sm ? 'Solo se usa si no hay sueldo registrado.' : 'Tu periodo va del ' + S.settings.startDay + ' al ' + (S.settings.startDay === 1 ? 'último día' : (S.settings.startDay - 1)) + ' del mes siguiente.') + '</span></div><select id="sday" aria-label="Día de inicio">' + Array.from({ length:28 }, (_, i) => '<option' + (i + 1 === S.settings.startDay ? ' selected' : '') + '>' + (i + 1) + '</option>').join('') + '</select></div></div></section>'; }
  if (id === 'recibos') return billsAdminCard() + recCard();
  if (id === 'avisos') return typeof sb !== 'undefined' && sb && session ? pushCard() : '<section class="card"><div class="card-h"><h2>Avisos</h2></div><p class="insight">Entra a tu cuenta para recibir avisos en el celular: recibos por pagar, la tarjeta y el repaso del día.</p></section>';
  if (id === 'presupuesto') { const parents = S.categories.filter(c => !c.parentId && !c.hidden), inc = parents.filter(c => c.type === 'ingreso'), exp = parents.filter(c => c.type === 'gasto'); let out = '';
    const bRow = (c, i) => '<div class="set"' + (i === 0 ? ' style="border-top:0"' : '') + '><div class="t"><b>' + esc(c.emoji + ' ' + c.name) + '</b></div><input inputmode="numeric" class="num" data-bud="' + esc(c.id) + '" value="' + (S.budgets[c.id] ? nf.format(S.budgets[c.id]) : '') + '" placeholder="Sin límite" aria-label="Presupuesto ' + esc(c.name) + '"></div>';
    if ((S.plans || []).length) out += '<section class="card"><div class="card-h"><h2>Presupuesto</h2><button class="pill" data-go="plan">Abrir plan</button></div><p class="insight">Tus límites y tu meta de ingresos salen de tu <b>Plan</b>. Edítalos allá y todo se actualiza.</p></section>';
    else out += '<section class="card"><div class="card-h"><h2>Presupuesto mensual</h2><span class="aside num">' + money(expenseBudgetTotal()) + '</span></div><div>' + exp.map(bRow).join('') + '</div></section>' +
      '<section class="card"><div class="card-h"><h2>Meta de ingresos</h2></div><div>' + inc.map(bRow).join('') + '</div></section>';
    return out + '<section class="card"><div class="card-h"><h2>Categorías</h2><button class="pill" data-newcat>Nueva categoría</button></div><p class="insight">' + S.categories.filter(c => !c.hidden).length + ' categorías activas. Crea una principal o una subcategoría.</p></section>'; }
  if (id === 'asistente') return iaCard();
  if (id === 'atajos') return shortcutsCard();
  if (id === 'cuenta') return cloudCard();
  if (id === 'datos') return '<section class="card"><div class="card-h"><h2>Respaldos</h2></div><div>' +
      '<div class="set" style="border-top:0"><div class="t"><b>' + (S.demo ? 'Datos de ejemplo' : S.source === 'moneymanager' ? 'Importado de Money Manager' : 'Datos propios') + '</b><span>' + nf.format(S.transactions.length) + ' movimientos · ' + S.accounts.filter(a => !a.hidden).length + ' cuentas</span></div></div>' +
      autoBackupRow() +
      '<div class="set"><div class="t"><b>Descargar respaldo</b><span>' + esc(backupAge()) + '</span></div><button class="btn sm" data-backup>Guardar</button></div>' +
      '<div class="set"><div class="t"><b>Copiar respaldo</b><span>Copia todos tus datos en formato JSON.</span></div><button class="btn sm ghost" id="copyjson">Copiar</button></div></div></section>' +
      '<section class="card"><div class="card-h"><h2>Traer datos</h2></div><div>' +
      '<div class="set" style="border-top:0"><div class="t"><b>Importar de Money Manager</b><span>Archivo .mmbak. Se lee aquí mismo, no se sube a ningún lado.</span></div><label class="btn sm file">Elegir<input type="file" id="mmfile" accept=".mmbak,.db,.sqlite,application/octet-stream"></label></div>' +
      '<div class="set"><div class="t"><b>Restaurar respaldo</b><span>Archivo .json copiado antes desde Caudal.</span></div><label class="btn sm ghost file">Elegir<input type="file" id="jsonfile" accept=".json,application/json,text/plain"></label></div>' +
      '<div class="set"><div class="t"><b>Pegar respaldo</b><span>Restaura el texto que copiaste con Copiar respaldo.</span></div><button class="btn sm ghost" id="pastejson">Pegar</button></div></div></section>' +
      '<p class="note" id="impmsg">' + (storageOk ? (cloudAI() ? 'Tus datos se guardan en este teléfono y en tu propia base en Supabase. Si pierdes el teléfono, entras con tu cuenta y vuelven.' : 'Tus datos se guardan solo en este navegador.') : 'Este navegador no permite guardar datos: lo que registres se pierde al cerrar. Abre la app en Safari o Chrome normal.') + '</p>' +
      '<section class="card"><div class="card-h"><h2>Zona delicada</h2></div><div><div class="set" style="border-top:0"><div class="t"><b>' + (ui.resetArm ? '¿Seguro? Se borra todo' : 'Empezar de cero') + '</b><span>Borra los datos guardados en este navegador.</span></div><button class="btn sm ' + (ui.resetArm ? 'danger' : 'ghost') + '" id="reset">' + (ui.resetArm ? 'Sí, borrar' : 'Borrar') + '</button></div></div></section>';
  return '';
}
const CHEV = '<svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>';
function setMenu(cur){
  return '<nav class="card setmenu" aria-label="Secciones de ajustes">' + setSecs().map(x => '<button class="setrow" data-setsec="' + x.id + '"' + (cur === x.id ? ' aria-current="true"' : '') + '><span class="sico">' + x.i + '</span><span class="t"><b>' + x.t + '</b><span>' + esc(x.s()) + '</span></span>' + CHEV + '</button>').join('') + '</nav>';
}
/* índice del buscador: títulos de cada fila de cada sección, más palabras clave de la sección */
let SETIDX = null;
function setIndex(){
  if (SETIDX) return SETIDX;
  const out = [], tpl = document.createElement('template');
  for (const x of setSecs()) {
    out.push({ sec:x.id, text:x.t, sub:x.s(), hay:norm(x.t + ' ' + x.k), top:true });
    tpl.innerHTML = setSecBody(x.id); const seen = new Set();
    tpl.content.querySelectorAll('h2, .set .t b, summary, .field > .label, .brow .t b, .acc .nm').forEach(el => {
      const txt = (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.textContent : el.textContent).trim(); if (!txt || txt.length > 60 || seen.has(txt)) return; seen.add(txt);
      const sp = el.closest('.set') && el.closest('.set').querySelector('.t span'); const sub = sp ? sp.textContent.trim().slice(0, 90) : '';
      out.push({ sec:x.id, text:txt, sub, hay:norm(txt + ' ' + sub) });
    });
  }
  return SETIDX = out;
}
function setResults(q){
  const tk = norm(q).split(' ').filter(Boolean); if (!tk.length) return '';
  const secT = Object.fromEntries(SET_SECS.map(x => [x.id, x.t]));
  const hits = setIndex().filter(r => tk.every(w => r.hay.includes(w))).sort((a, b) => (b.top ? 1 : 0) - (a.top ? 1 : 0)).slice(0, 14);
  if (!hits.length) return '<section class="card"><p class="insight">No encontré ajustes con «' + esc(q) + '». Prueba con otra palabra, por ejemplo recibos, respaldo o avisos.</p></section>';
  return '<section class="card setmenu">' + hits.map(r => { const x = SET_SECS.find(s => s.id === r.sec);
    return '<button class="setrow" data-setsec="' + r.sec + '" data-sett="' + esc(r.top ? '' : r.text) + '"><span class="sico">' + x.i + '</span><span class="t"><b>' + esc(r.text) + '</b><span>' + esc(r.top ? r.sub : secT[r.sec] + (r.sub ? ' · ' + r.sub : '')) + '</span></span>' + CHEV + '</button>'; }).join('') + '</section>';
}
function vAjustes(){
  SETIDX = null;
  const desk = isDesk(), secs = setSecs();
  let sec = ui.setSec && secs.some(x => x.id === ui.setSec) ? ui.setSec : null; if (desk && !sec) sec = 'general';
  const q = ui.setQ || '';
  const search = '<label class="setq"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input type="search" id="setq" value="' + esc(q) + '" placeholder="Buscar en ajustes" autocomplete="off" enterkeyhint="search" aria-label="Buscar en ajustes">' + (q ? '<button class="x" data-setclear aria-label="Borrar búsqueda">✕</button>' : '') + '</label>';
  const side = search + '<div id="setres">' + (q ? setResults(q) : setMenu(desk ? sec : null)) + '</div>';
  if (desk) { const x = secs.find(s => s.id === sec);
    return '<div class="hello"><h1>Ajustes</h1><p>Busca un ajuste o elige una sección</p></div><div class="setdesk"><aside>' + side + '</aside><div class="setmain"><h2 class="sech"><span class="sico">' + x.i + '</span>' + x.t + '</h2>' + setSecBody(sec) + '</div></div>'; }
  if (sec && !q) { const x = secs.find(s => s.id === sec);
    return '<div class="sethead"><button class="setback" data-setback aria-label="Volver a Ajustes"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>Ajustes</button><h1>' + x.t + '</h1></div>' + setSecBody(sec); }
  return '<div class="hello"><h1>Ajustes</h1><p>Busca un ajuste o elige una sección</p></div>' + side;
}
function setGo(sec, text){
  const fwd = !ui.setSec && !isDesk(); if (fwd) navPush('sec');
  ui.setSec = sec; ui.setQ = ''; ui.setFocus = false; render(); window.scrollTo({ top:0 }); if (fwd) navAnim('navfwd');
  if (!text) return;
  const el = [...document.querySelectorAll('#main h2, #main .set .t b, #main summary, #main .field > .label, #main .brow .t b, #main .acc .nm')].find(n => (n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : n.textContent).trim() === text);
  if (!el) return; const d = el.closest('details'); if (d) d.open = true;
  const box = el.closest('.set, .howto, .fold, .field, .brow, .card-h') || el;
  setTimeout(() => { box.scrollIntoView({ block:'center', behavior:'smooth' }); box.classList.remove('hit'); void box.offsetWidth; box.classList.add('hit'); }, 60);
}
document.addEventListener('input', e => { if (e.target.id !== 'setq') return; ui.setQ = e.target.value; const r = $('#setres'); if (r) r.innerHTML = ui.setQ.trim() ? setResults(ui.setQ) : setMenu(isDesk() ? (ui.setSec || 'general') : null);
  const lb = e.target.closest('.setq'); let x = lb.querySelector('[data-setclear]'); if (ui.setQ && !x) lb.insertAdjacentHTML('beforeend', '<button class="x" data-setclear aria-label="Borrar búsqueda">✕</button>'); else if (!ui.setQ && x) x.remove(); });
document.addEventListener('focusin', e => { if (e.target.id === 'setq') ui.setFocus = true; });
document.addEventListener('focusout', e => { if (e.target.id === 'setq') ui.setFocus = false; });
document.addEventListener('keydown', e => { if (e.target.id === 'setq' && e.key === 'Enter') { e.preventDefault(); const b = document.querySelector('#setres [data-setsec]'); if (b) b.click(); } });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-setsec],[data-setback],[data-setclear]'); if (!b) return; e.stopPropagation();
  if (b.dataset.setclear !== undefined) { ui.setQ = ''; render(); const i = $('#setq'); if (i) i.focus(); return; }
  if (b.dataset.setback !== undefined) { if (NAVH.depth >= 2) return history.back(); ui.setSec = null; render(); window.scrollTo({ top:0 }); return navAnim('navback'); }
  setGo(b.dataset.setsec, b.dataset.sett || '');
}, true);
