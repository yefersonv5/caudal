/* ---------- Asistente con IA: por confirmar, cuadre con el banco, revisión semanal y cierre del periodo ---------- */
const lsGet = k => { try { return localStorage.getItem('caudal.' + k) || ''; } catch (_) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem('caudal.' + k, v); } catch (_) {} };
const catPath = id => { const c = cat(id), pc = parentOf(c); return pc ? pc.name + (c && c.parentId ? ' > ' + c.name : '') : 'Sin categoría'; };
const txLine = t => [t.id, t.date, t.type, t.amount, t.type === 'transferencia' ? 'a ' + ((accById(t.toAccountId) || {}).name || '') : catPath(t.categoryId), (accById(t.accountId) || {}).name || '', (t.note || '').replace(/[|\n]/g, ' '), t.pending ? 'por confirmar' : ''].join(' | ');
const aiLoading = (title, msg) => openSheet('<div class="sheet-h"><b id="sheet-title">' + title + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="empty">' + msg + '</div></div>');

/* ----- por confirmar ----- */
function pendingCard(){
  const list = S.transactions.filter(t => t.pending).sort((a, b) => b.date.localeCompare(a.date));
  if (!list.length) return '';
  return '<section class="card"><div class="card-h"><h2>Por confirmar</h2><span class="pill">' + list.length + '</span></div>' +
    '<p class="insight">Valores aproximados. Ábrelos, pon el valor real (la app del banco lo tiene) y quita la marca. También puedes cuadrar la cuenta con la IA.</p>' +
    list.slice(0, 6).map(txRow).join('') + (list.length > 6 ? '<p class="note" style="padding:0">Y ' + (list.length - 6) + ' más.</p>' : '') + '</section>';
}

/* ----- avisos de la IA en Inicio (uno a la vez) ----- */
function cierrePeriod(){ const p0 = period(0); return { prev:period(-1), day:daysAgo(p0.s) }; }
function aiNudges(){
  if (S.demo || !aiOn() || !(S.transactions || []).length || ui.offset !== 0) return '';
  const { prev, day } = cierrePeriod();
  if (day <= 6 && lsGet('cierre') !== prev.s && S.transactions.some(t => inP(t, prev) && t.type === 'gasto'))
    return '<div class="banner"><span><b>Cerró tu periodo del ' + fmtShort(prev.start) + ' al ' + fmtShort(prev.end) + '.</b> La IA te arma el cierre: cómo te fue y qué ajustar del plan.</span><span style="display:flex;gap:6px"><button class="btn sm ghost" data-ainot="cierre:' + prev.s + '">Hoy no</button><button class="btn sm" data-cierre>Ver cierre</button></span></div>';
  const last = lsGet('rev'), since = iso(new Date(Date.now() - 7 * 864e5));
  if ((!last || daysAgo(last) >= 7) && lsGet('revskip') !== iso(new Date()) && S.transactions.filter(t => t.date >= since && t.type !== 'ajuste').length >= 5)
    return '<div class="banner"><span><b>Revisión de la semana.</b> La IA busca errores en lo que registraste: categorías cruzadas, montos raros, repetidos.</span><span style="display:flex;gap:6px"><button class="btn sm ghost" data-ainot="revskip:' + iso(new Date()) + '">Hoy no</button><button class="btn sm" data-rev>Revisar</button></span></div>';
  return '';
}
function aiCard(){
  if (!aiOn() || S.demo) return '';
  const last = lsGet('rev');
  return '<section class="card"><div class="card-h"><h2>Asistente</h2>' + SPARK + '</div>' +
    '<div class="set" style="border-top:0"><div class="t"><b>Revisión de calidad</b><span>' + (last ? 'Última: ' + (daysAgo(last) === 0 ? 'hoy' : 'hace ' + daysAgo(last) + ' días') : 'Busca errores en tus registros de las últimas dos semanas') + '</span></div><button class="btn sm" data-rev>Revisar</button></div>' +
    '<div class="set"><div class="t"><b>Cierre del periodo anterior</b><span>Cómo te fue y qué ajustar del plan</span></div><button class="btn sm ghost" data-cierre>Ver</button></div></section>';
}

/* ----- 1. cuadrar con los movimientos del banco ----- */
let CQAI = null;
function cqAiBox(){
  if (!aiOn()) return '';
  if (!CQAI || CQAI.id !== CQ.id) CQAI = { id:CQ.id, text:'', files:[], res:null, busy:false };
  const thumbs = CQAI.files.map((f, i) => '<span class="thumb"><img alt="Captura ' + (i + 1) + '" src="' + (f._url || (f._url = URL.createObjectURL(f))) + '"><button data-cqrm="' + i + '" aria-label="Quitar">✕</button></span>').join('');
  return '<section class="card" style="padding:16px" id="cq-ai"><div class="card-h"><h2 style="font-size:15px">Comparar con el banco usando IA</h2>' + SPARK + '</div>' +
    '<p class="insight" style="margin:0 0 10px">Pega o sube capturas de los movimientos que muestra la app del banco. La IA te dice qué falta en Caudal y qué no cuadra.</p>' +
    '<textarea class="inp" id="cq-text" rows="3" style="font-family:inherit;resize:vertical" placeholder="Pega aquí los movimientos del banco">' + esc(CQAI.text) + '</textarea>' +
    (thumbs ? '<div class="thumbs">' + thumbs + '</div>' : '') +
    '<div class="two" style="margin-top:8px"><label class="btn ghost" style="cursor:pointer">Subir capturas<input type="file" id="cq-files" accept="image/*" multiple hidden></label><button class="btn" type="button" data-cqai' + (CQAI.busy ? ' disabled' : '') + '>' + (CQAI.busy ? 'Comparando…' : 'Comparar') + '</button></div>' +
    '<div class="err" id="cq-aierr"></div><div id="cq-aires">' + (CQAI.res ? cqAiResult() : '') + '</div></section>';
}
function cqAiRedraw(msg){ const box = $('#cq-ai'); if (!box) return; box.outerHTML = cqAiBox(); if (msg) $('#cq-aierr').textContent = msg; }
async function cqAiRun(){
  const ta = $('#cq-text'); if (ta) CQAI.text = ta.value;
  if (!CQAI.text.trim() && !CQAI.files.length) return cqAiRedraw('Pega los movimientos o sube una captura.');
  const id = CQ.id, a = accById(id), from = iso(new Date(Date.now() - 45 * 864e5));
  const mine = S.transactions.filter(t => t.date >= from && (t.accountId === id || t.toAccountId === id) && !hiddenTx(t));
  const prompt = 'Eres el asistente para cuadrar cuentas de una app personal de gastos en Colombia (pesos COP). Hoy es ' + iso(new Date()) + '.\n' +
    'Compara los movimientos que muestra el banco para la cuenta "' + a.name + '" con los que el usuario anotó en la app.\n\nReglas:\n' +
    '- Usa solo el rango de fechas que cubre lo del banco; ignora lo de la app fuera de ese rango.\n' +
    '- Ignora saldos disponibles; compara solo movimientos. Montos en pesos enteros.\n' +
    '- Un movimiento del banco coincide con uno de la app si el monto es igual o casi igual y la fecha está a 2 días o menos, aunque la descripción sea distinta.\n' +
    '- Una transferencia en la app puede aparecer en el banco como salida o entrada a otra cuenta propia.\n' +
    '- faltan: movimientos del banco que no están en la app. type gasto, ingreso o transferencia; categoryId de la lista para gastos e ingresos; note corta con el comercio o concepto.\n' +
    '- distintos: pares que coinciden pero con monto diferente (incluye los marcados "por confirmar"): id de la app y monto del banco.\n' +
    '- sobran: ids de la app que no aparecen en el banco dentro del rango.\n\n' +
    'Categorías (id | tipo | nombre):\n' + catList() + '\n\nAnotado en la app (id | fecha | tipo | monto | categoría | cuenta | nota | marca):\n' + (mine.map(txLine).join('\n') || '(nada)') +
    '\n\nResponde SOLO con JSON: {"rango":"del YYYY-MM-DD al YYYY-MM-DD","faltan":[{"type":"gasto","amount":0,"date":"YYYY-MM-DD","categoryId":"","note":""}],"distintos":[{"id":"","amount":0}],"sobran":[""],"nota":"una frase"}\n\n' +
    'Movimientos del banco:\n<<<\n' + (CQAI.text.trim() || '(ver capturas)') + '\n>>>';
  CQAI.busy = true; cqAiRedraw();
  try {
    const imgs = CQAI.files.length ? await Promise.all(CQAI.files.map(shrink)) : null;
    const r = await iaCall(prompt, true, imgs), L = learn();
    const faltan = (r.faltan || []).map(x => clean1(x, L)).filter(Boolean).map(x => ({ ...x, accountId:id, src:'cuadre', pending:false }));
    const distintos = (r.distintos || []).map(d => ({ t:S.transactions.find(t => t.id === d.id), amount:Math.round(Math.abs(+d.amount || 0)) })).filter(d => d.t && d.amount && d.amount !== d.t.amount);
    const sobran = (r.sobran || []).map(i => S.transactions.find(t => t.id === i)).filter(Boolean);
    CQAI.res = { faltan, distintos, sobran, rango:r.rango || '', nota:r.nota || '' };
  } catch (e) { CQAI.busy = false; return cqAiRedraw(aiErr(e)); }
  CQAI.busy = false; cqAiRedraw();
}
function cqAiResult(){
  const R = CQAI.res; let h = '<div style="margin-top:12px">';
  if (R.rango || R.nota) h += '<p class="note" style="padding:0">' + esc([R.rango ? 'Banco ' + R.rango : '', R.nota].filter(Boolean).join('. ')) + '</p>';
  if (!R.faltan.length && !R.distintos.length && !R.sobran.length) return h + '<p class="insight"><b class="pos">Todo coincide ✓</b> No encontré diferencias en ese rango.</p></div>';
  if (R.faltan.length) h += '<p class="label" style="margin:10px 0 4px">Faltan en Caudal (' + R.faltan.length + ')</p>' + R.faltan.map(x => '<div class="set"><div class="t"><b>' + esc(x.note || catPath(x.categoryId)) + '</b><span>' + esc(x.date + ' · ' + catPath(x.categoryId)) + '</span></div><span class="num">' + money(x.type === 'ingreso' ? x.amount : -x.amount) + '</span></div>').join('') +
    '<button class="btn accent block" type="button" data-cqaiadd style="margin-top:8px">Revisar y guardar ' + R.faltan.length + '</button>';
  if (R.distintos.length) h += '<p class="label" style="margin:14px 0 4px">Con otro valor en el banco</p>' + R.distintos.map((d, i) => txRow(d.t) + '<button class="btn sm" type="button" data-cqaifix="' + i + '" style="margin:2px 0 8px">Usar ' + money(d.amount) + ' del banco</button>').join('');
  if (R.sobran.length) h += '<p class="label" style="margin:14px 0 4px">En Caudal pero no en el banco</p><p class="note" style="padding:0">¿Repetidos o anotados en otra cuenta? Tócalos para corregir.</p>' + R.sobran.map(txRow).join('');
  return h + '</div>';
}

/* ----- 4. revisión semanal de calidad ----- */
let REV = null;
function typicals(){
  const since = iso(new Date(Date.now() - 180 * 864e5)), m = {};
  for (const t of S.transactions) if (t.type === 'gasto' && t.date >= since && t.categoryId) (m[t.categoryId] = m[t.categoryId] || []).push(t.amount);
  return Object.entries(m).filter(([, v]) => v.length >= 3).map(([k, v]) => { v.sort((a, b) => a - b); return catPath(k) + ': típico ' + v[Math.floor(v.length / 2)] + ', máx ' + v[v.length - 1] + ' (' + v.length + ' veces)'; }).join('\n');
}
async function revRun(){
  aiLoading('Revisión de la semana', 'Revisando tus registros de las últimas dos semanas…');
  const since = iso(new Date(Date.now() - 14 * 864e5));
  const tx = S.transactions.filter(t => t.date >= since && !hiddenTx(t));
  const prompt = 'Eres el revisor de calidad de los registros de gastos personales de ' + userName() + ' en Bogotá (pesos COP). Hoy es ' + iso(new Date()) + '.\n' +
    'Revisa los movimientos de las últimas dos semanas y encuentra errores PROBABLES de registro. No opines sobre hábitos de gasto: solo calidad de los datos.\n' +
    'Busca: categoría que no corresponde a la nota; monto mal digitado (un cero de más o de menos, muy fuera de lo típico); posibles duplicados (mismo monto y fecha cercana); movimientos "por confirmar"; cuenta poco habitual para ese concepto; montos grandes sin nota.\n' +
    'Sé conservador: solo lo que tenga buena probabilidad de ser error, máximo 10. Si todo se ve bien, hallazgos vacío.\n' +
    'arreglo: solo los campos que cambiarías con seguridad (categoryId de la lista, amount, accountId de la lista, note, o borrar:true para un duplicado). Si no hay arreglo seguro, arreglo = {} y el usuario lo revisa a mano.\n\n' +
    'Categorías (id | tipo | nombre):\n' + catList() + '\n\nCuentas (id | nombre):\n' + S.accounts.filter(a => !a.hidden).map(a => a.id + ' | ' + a.name).join('\n') +
    '\n\nMontos típicos por categoría (últimos 6 meses):\n' + typicals() +
    '\n\nMovimientos (id | fecha | tipo | monto | categoría | cuenta | nota | marca):\n' + (tx.map(txLine).join('\n') || '(nada)') +
    '\n\nResponde SOLO con JSON: {"resumen":"1 o 2 frases sobre la calidad de los registros","hallazgos":[{"id":"","tipo":"categoria|monto|duplicado|confirmar|cuenta|nota","mensaje":"frase corta y clara","arreglo":{}}]}';
  try {
    const r = await iaCall(prompt, true, null, 'ask');
    REV = { resumen:r.resumen || '', items:(r.hallazgos || []).map(x => ({ ...x, t:S.transactions.find(t => t.id === x.id), arreglo:x.arreglo || {} })).filter(x => x.t) };
    lsSet('rev', iso(new Date())); revDraw();
  } catch (e) { openSheet('<div class="sheet-h"><b id="sheet-title">Revisión de la semana</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="err">' + esc(aiErr(e)) + '</div><button class="btn block" data-rev>Intentar de nuevo</button></div>'); }
}
function fixTxt(t, a){
  const p = [];
  if (a.borrar) return 'Borrar (repetido)';
  if (a.categoryId && cat(a.categoryId) && a.categoryId !== t.categoryId) p.push('categoría a ' + catPath(a.categoryId));
  if (+a.amount > 0 && +a.amount !== t.amount) p.push('valor a ' + money(+a.amount));
  if (a.accountId && accById(a.accountId) && a.accountId !== t.accountId) p.push('cuenta a ' + accById(a.accountId).name);
  if (a.note && a.note !== t.note) p.push('nota "' + a.note + '"');
  return p.length ? 'Cambiar ' + p.join(', ') : '';
}
function revDraw(){
  if (!REV) return;
  REV.items = REV.items.map(x => ({ ...x, t:S.transactions.find(t => t.id === x.id) })).filter(x => x.t);
  let h = '<div class="sheet-h"><b id="sheet-title">Revisión de la semana</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form revs">';
  h += '<section class="card glow" style="padding:16px"><span class="label">' + (REV.items.length ? REV.items.length + (REV.items.length === 1 ? ' cosa por revisar' : ' cosas por revisar') : 'Todo en orden ✓') + '</span><p class="insight" style="margin:6px 0 0">' + esc(REV.resumen) + '</p></section>';
  REV.items.forEach((x, i) => {
    const fx = fixTxt(x.t, x.arreglo);
    h += '<section class="card" style="padding:14px"><p class="insight" style="margin:0 0 6px"><b>' + esc(x.mensaje || '') + '</b></p>' + txRow(x.t) +
      '<div class="two" style="margin-top:8px">' + (fx ? '<button class="btn sm" type="button" data-revfix="' + i + '">' + esc(fx) + '</button>' : '<span class="note" style="padding:0;align-self:center">Tócalo para corregirlo a mano</span>') +
      '<button class="btn sm ghost" type="button" data-revskip="' + i + '">Está bien así</button></div></section>';
  });
  h += '</div>';
  if ($('#sheet').hidden) openSheet(h); else { const sc = $('#sheet').scrollTop; $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#sheet').scrollTop = sc; }
}
function revFix(i){
  const x = REV.items[i]; if (!x) return; const t = x.t, a = x.arreglo;
  if (a.borrar) S.transactions = S.transactions.filter(y => y.id !== t.id);
  else {
    const c = a.categoryId && cat(a.categoryId); if (c && c.type === t.type) t.categoryId = c.id;
    if (+a.amount > 0) { t.amount = Math.round(+a.amount); delete t.pending; }
    if (a.accountId && accById(a.accountId)) t.accountId = a.accountId;
    if (a.note) t.note = String(a.note).slice(0, 80);
  }
  REV.items.splice(i, 1); sortTx(S); save(); render(); revDraw(); toast('Arreglado');
}

/* ----- 5. cierre del periodo ----- */
let CIE = null;
async function cierreRun(){
  const p = period(-1), pl = planFor(p);
  aiLoading('Cierre del periodo', 'Armando el cierre del ' + fmtShort(p.start) + ' al ' + fmtShort(p.end) + '…');
  const ps = [p, period(-2), period(-3)];
  const L = ['Periodo que cerró: ' + p.s + ' a ' + p.e + '. Hoy: ' + iso(new Date()) + '.'];
  for (const q of ps) { let inc = 0, exp = 0; for (const t of S.transactions) if (inP(t, q)) { if (t.type === 'ingreso') inc += t.amount; else if (t.type === 'gasto') exp += t.amount; }
    L.push('- ' + q.s + ' a ' + q.e + ': ingresos ' + COP(inc) + ', gastos ' + COP(exp) + ', balance ' + COP(inc - exp)); }
  if (pl) {
    const R = planReal(pl, p);
    L.push('\nPlan "' + (pl.name || 'Plan') + '": ingreso planeado ' + COP(pl.income) + ', entró ' + COP(R.inc) + '. Rubros (id | nombre | tipo | plan | real en el periodo que cerró, -1, -2):');
    for (const i of pl.items) L.push('- ' + i.id + ' | ' + i.name + ' | ' + (isGastoItem(i) ? 'gasto ' + i.cls : 'ahorro') + ((i.every || 1) > 1 ? ' (se paga ' + everyTxt(i.every) + ')' : '') + ' | ' + COP(i.amount) + ' | ' + ps.map(q => COP(itemSpentIn(pl, i, q))).join(' | '));
    L.push('- Gastos fuera del plan en el periodo que cerró: ' + COP(R.out) + (R.fromSaved ? '; pagado con ahorros: ' + COP(R.fromSaved) : '') + '. Por categoría: ' + Object.entries(R.outCats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => (k === '_' ? 'Sin categoría' : (cat(k) || {}).name) + ' ' + COP(v)).join(', '));
  }
  const top = {}; for (const t of S.transactions) if (t.type === 'gasto' && inP(t, p)) { const k = (t.note || catPath(t.categoryId)).slice(0, 40); top[k] = (top[k] || 0) + t.amount; }
  L.push('\nMayores conceptos del periodo: ' + Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => k + ' ' + COP(v)).join('; '));
  const prompt = 'Eres el analista financiero personal de ' + userName() + ', en Bogotá. Escribe el cierre del periodo que acaba de terminar, en español de Colombia, directo y cálido, sin la raya larga. Cifras como $1.234.567.\n' +
    'texto (markdown corto, máximo 12 líneas): **Cómo te fue** con 2 o 3 frases y cifras (ingresos, gastos, balance, frente al plan); **Lo que se salió** en viñetas "- "; **Lo que salió bien** en viñetas.\n' +
    'ajustes: propuestas para el plan del periodo siguiente, solo con razón clara en los 3 periodos (rubro que se pasa o se queda corto 2 de 3 veces). Máximo 4, montos redondeados a miles. itemId de la lista de rubros. Si no hay plan o nada que ajustar, lista vacía.\n' +
    'Usa solo estos datos:\n\n' + L.join('\n') +
    '\n\nResponde SOLO con JSON: {"texto":"","ajustes":[{"itemId":"","nuevo":0,"razon":""}]}';
  try {
    const r = await iaCall(prompt, true, null, 'ask');
    CIE = { p, texto:r.texto || '', ajustes:(r.ajustes || []).map(a => ({ ...a, nuevo:Math.round(+a.nuevo || 0), item:pl && pl.items.find(i => i.id === a.itemId) })).filter(a => a.item && a.nuevo > 0 && a.nuevo !== a.item.amount) };
    lsSet('cierre', p.s); render(); cierreDraw();
  } catch (e) { openSheet('<div class="sheet-h"><b id="sheet-title">Cierre del periodo</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="err">' + esc(aiErr(e)) + '</div><button class="btn block" data-cierre>Intentar de nuevo</button></div>'); }
}
function cierreDraw(){
  let h = '<div class="sheet-h"><b id="sheet-title">Cierre: ' + fmtShort(CIE.p.start) + ' al ' + fmtShort(CIE.p.end) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">';
  h += '<div class="answer" style="margin:0;white-space:pre-wrap">' + mdLite(CIE.texto) + '</div>';
  if (CIE.ajustes.length) {
    h += '<section class="card" style="padding:16px"><h2 style="margin:0 0 4px;font-size:15px">Ajustes sugeridos al plan</h2><p class="note" style="padding:0">Se aplican desde este periodo; los anteriores no cambian.</p>';
    CIE.ajustes.forEach((a, i) => { h += '<div class="set"><div class="t"><b>' + esc(a.item.name) + ': ' + money(a.item.amount) + ' → ' + money(a.nuevo) + '</b><span>' + esc(a.razon || '') + '</span></div>' +
      (a.done ? '<span class="pos">Aplicado ✓</span>' : '<button class="btn sm" type="button" data-cieapply="' + i + '">Aplicar</button>') + '</div>'; });
    h += '</section>';
  }
  h += '<p class="note" style="padding:0">Puedes volver a verlo desde Análisis > Asistente.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else { const sc = $('#sheet').scrollTop; $('#sheet').innerHTML = '<div class="grab"></div>' + h; $('#sheet').scrollTop = sc; }
}
/* aplica el ajuste en la versión del plan vigente desde este periodo (la crea si hace falta) */
function cierreApply(i){
  const a = CIE.ajustes[i]; if (!a || a.done) return;
  const p0 = period(0); let pl = planFor(p0); if (!pl) return;
  if (pl.start < p0.s) {
    const old = pl; pl = JSON.parse(JSON.stringify(old)); pl.id = uid(); pl.start = p0.s; pl.name = 'Plan ' + MESL[p0.start.getMonth()] + ' ' + p0.start.getFullYear();
    const map = {}; pl.items.forEach(it => { const n = uid(); map[it.id] = n; it.id = n; });
    S.plans.push(pl); CIE.ajustes.forEach(x => { if (map[x.item.id]) x.itemNew = map[x.item.id]; });
  }
  const it = pl.items.find(x => x.id === (a.itemNew || a.item.id) || x.name === a.item.name); if (!it) return toast('No encontré ese rubro en el plan');
  it.amount = a.nuevo; a.done = true;
  CIE.ajustes.forEach(x => { if (!x.itemNew) { const m = pl.items.find(y => y.name === x.item.name); if (m) x.itemNew = m.id; } });
  save(); render(); cierreDraw(); toast('Plan actualizado');
}

/* ----- eventos ----- */
document.addEventListener('change', e => {
  if (e.target.id !== 'cq-files' || !CQAI) return;
  const ta = $('#cq-text'); if (ta) CQAI.text = ta.value;
  CQAI.files = CQAI.files.concat(Array.from(e.target.files || [])).slice(0, 4); cqAiRedraw();
});
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.tx && el.closest('.revs')) { CQ_RET = () => revDraw(); return; }
  if (d.ainot) { e.stopPropagation(); const [k, v] = d.ainot.split(':'); lsSet(k, v); return render(); }
  if (d.rev !== undefined) { e.stopPropagation(); return revRun(); }
  if (d.cierre !== undefined) { e.stopPropagation(); return (CIE && CIE.p.s === period(-1).s) ? cierreDraw() : cierreRun(); }
  if (d.revfix) { e.stopPropagation(); return revFix(+d.revfix); }
  if (d.revskip) { e.stopPropagation(); REV.items.splice(+d.revskip, 1); return revDraw(); }
  if (d.cieapply) { e.stopPropagation(); return cierreApply(+d.cieapply); }
  if (!CQAI || !el.closest('#cq-ai')) return;
  e.stopPropagation();
  if (d.cqai !== undefined) return cqAiRun();
  if (d.cqrm) { CQAI.files.splice(+d.cqrm, 1); return cqAiRedraw(); }
  if (d.cqaifix) { const x = CQAI.res.distintos[+d.cqaifix]; if (x) { x.t.amount = x.amount; delete x.t.pending; CQAI.res.distintos.splice(+d.cqaifix, 1); save(); render(); toast('Valor corregido'); } return cqAiRedraw(); }
  if (d.cqaiadd !== undefined) {
    const id = CQ.id, items = CQAI.res.faltan.map(x => ({ ...x })); CQAI.res.faltan = [];
    SM = { text:'', files:[], items, busy:false, origin:'cuadre', engine:'ia', retAcc:id }; return drawReview();
  }
}, true);
