/* ---------- Asistente con IA: por confirmar, cuadre con el banco, revisión semanal y cierre del periodo ---------- */
const catPath = id => { const c = cat(id), pc = parentOf(c); return pc ? pc.name + (c && c.parentId ? ' > ' + c.name : '') : 'Sin categoría'; };
const txLine = t => [t.id, t.date, t.type, t.amount, t.type === 'transferencia' ? 'a ' + ((accById(t.toAccountId) || {}).name || '') : catPath(t.categoryId), (accById(t.accountId) || {}).name || '', (t.note || '').replace(/[|\n]/g, ' '), t.pending ? 'por confirmar' : ''].join(' | ');
const aiLoading = (title, msg) => openSheet('<div class="sheet-h"><b id="sheet-title">' + title + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="empty">' + msg + '</div></div>');

/* ----- por confirmar ----- */
function pendingCard(){
  const list = S.transactions.filter(t => t.pending && t.type !== 'transferencia').sort((a, b) => b.date.localeCompare(a.date));
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
  const card = S.accounts.find(a => isCard(a) && !a.hidden && a.card.due);
  if (card) { const due = nextDay(card.card.due), left = Math.round((due - new Date()) / 864e5), lf = lsGet('foto');
    if (left <= 5 && (!lf || daysAgo(lf) >= 15) && lsGet('fotoskip') !== iso(new Date()))
      return '<div class="banner"><span><b>Antes de pagar la tarjeta</b> (' + due.getDate() + ' ' + MES[due.getMonth()] + '), cuadra tus cuentas con una captura de Lulo. Es un minuto.</span><span style="display:flex;gap:6px"><button class="btn sm ghost" data-ainot="fotoskip:' + iso(new Date()) + '">Hoy no</button><button class="btn sm" data-foto>Cuadrar</button></span></div>'; }
  return '';
}
function aiCard(){
  if (!aiOn() || S.demo) return '';
  return '<section class="card"><div class="card-h"><h2>Cierre del periodo</h2>' + SPARK + '</div>' +
    '<div class="set" style="border-top:0"><div class="t"><b>Periodo anterior</b><span>Cómo te fue y qué ajustar del plan</span></div><button class="btn sm ghost" data-cierre>Ver</button></div></section>' + iaGuardadosCard();
}
/* análisis guardados: abrirlos no consulta a la IA, se leen de lo que quedó en la nube */
function iaGuardadosCard(){
  const g = IAN.guardados; if (!g.length) return '';
  const ver = ui.iaAll ? g : g.slice(0, 5);
  return '<section class="card"><div class="card-h"><h2>Tus análisis guardados</h2><span class="aside">periodo anterior y actual</span></div><div>' +
    ver.map(r => { const d = r.data || {};
      return '<button class="acc" data-iaver="' + esc(r.id) + '"><span class="nm">' + esc(r.kind === 'semanal' && d.titulo ? d.titulo : IA_GUARDA[r.kind]) + '<small>' + (r.kind === 'cierre' && d.ps ? 'Del ' + fmtShort(parseISO(d.ps)) + ' al ' + fmtShort(parseISO(d.pe)) : fmtShort(parseISO(r.date)) + ' ' + parseISO(r.date).getFullYear()) + '</small></span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>'; }).join('') + '</div>' +
    (g.length > 5 ? '<button class="btn ghost block" data-iaall>' + (ui.iaAll ? 'Ver menos' : 'Ver los ' + g.length) + '</button>' : '') +
    '<p class="note" style="padding:0">Abrirlos no gasta créditos. Para un periodo más antiguo, pídeselo al asistente.</p></section>';
}
function iaVer(id){
  const r = IAN.guardados.find(x => x.id === id); if (!r) return; const d = r.data || {};
  if (r.kind === 'cierre') { cierreCargar(r); return cierreDraw(); }
  openSheet('<div class="sheet-h"><b id="sheet-title">' + esc(d.titulo || 'Tu semana') + '</b>' + ttsBtn('semg', (d.titulo || 'Tu semana') + '. ' + (d.resumen || ''), true) + '<button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><p class="note" style="padding:0">Semana del ' + fmtShort(parseISO(r.date)) + '</p>' + semanalBody(d.resumen || '') + '</div>');
}
document.addEventListener('click', e => { if (!e.target.closest('[data-iaall]')) return; e.stopPropagation(); ui.iaAll = !ui.iaAll; render(); }, true);

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
    'Usa solo estos datos:\n' + perfilBlock() + '\n' + L.join('\n') +
    '\naprendizajes: hasta 3 patrones duraderos de cómo maneja su plata que veas en estos datos y que no estén ya en su perfil, hábitos o lo aprendido (frase corta en tercera persona). Si no hay nada nuevo, lista vacía.' +
    '\n\nResponde SOLO con JSON: {"texto":"","ajustes":[{"itemId":"","nuevo":0,"razon":""}],"aprendizajes":[""]}';
  try {
    const r = await iaCall(prompt, true, null, 'ask');
    CIE = { p, texto:r.texto || '', ajustes:(r.ajustes || []).map(a => ({ ...a, nuevo:Math.round(+a.nuevo || 0), item:pl && pl.items.find(i => i.id === a.itemId) })).filter(a => a.item && a.nuevo > 0 && a.nuevo !== a.item.amount) };
    aprAdd(r.aprendizajes, 'cierre'); lsSet('cierre', p.s); cierreGuardar(); render(); cierreDraw();
  } catch (e) { openSheet('<div class="sheet-h"><b id="sheet-title">Cierre del periodo</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="err">' + esc(aiErr(e)) + '</div><button class="btn block" data-cierre>Intentar de nuevo</button></div>'); }
}
function cierreGuardar(){ if (CIE) iaGuardar('cierre-' + CIE.p.s, 'cierre', { ps:CIE.p.s, pe:CIE.p.e, texto:CIE.texto, ajustes:CIE.ajustes.map(({ itemId, nuevo, razon, done }) => ({ itemId, nuevo, razon, done:!!done })) }, CIE.p.s); }
/* arma CIE desde un cierre guardado: los ajustes se vuelven a enlazar con los rubros del plan de ese periodo */
function cierreCargar(row){
  const d = row.data || {}, p = { s:d.ps, e:d.pe, start:parseISO(d.ps), end:parseISO(d.pe) }, pl = planFor(p);
  CIE = { p, texto:d.texto || '', ajustes:(d.ajustes || []).map(a => ({ ...a, item:pl && pl.items.find(i => i.id === a.itemId) })).filter(a => a.item) };
}
function cierreDraw(){
  let h = '<div class="sheet-h"><b id="sheet-title">Cierre: ' + fmtShort(CIE.p.start) + ' al ' + fmtShort(CIE.p.end) + '</b>' + ttsBtn('cie', CIE.texto) + '<button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">';
  h += '<div class="answer" style="margin:0;white-space:pre-wrap">' + mdLite(CIE.texto) + '</div>';
  if (CIE.ajustes.length) {
    h += '<section class="card" style="padding:16px"><h2 style="margin:0 0 4px;font-size:15px">Ajustes sugeridos al plan</h2><p class="note" style="padding:0">Se aplican desde este periodo; los anteriores no cambian.</p>';
    CIE.ajustes.forEach((a, i) => { h += '<div class="set"><div class="t"><b>' + esc(a.item.name) + ': ' + money(a.item.amount) + ' → ' + money(a.nuevo) + '</b><span>' + esc(a.razon || '') + '</span></div>' +
      (a.done ? '<span class="pos">Aplicado ✓</span>' : '<button class="btn sm" type="button" data-cieapply="' + i + '">Aplicar</button>') + '</div>'; });
    h += '</section>';
  }
  h += '<p class="note" style="padding:0">Puedes volver a verlo en Asistente › Tus análisis guardados.</p></div>';
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
  cierreGuardar(); save(); render(); cierreDraw(); toast('Plan actualizado');
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
  if (d.ainot) { e.stopPropagation(); const [k, v] = d.ainot.split(':'); lsSet(k, v); return render(); }
  if (d.cierre !== undefined) { e.stopPropagation(); const ps = period(-1).s, g = IAN.guardados.find(r => r.id === 'cierre-' + ps);
    if (!(CIE && CIE.p.s === ps) && g) cierreCargar(g); return (CIE && CIE.p.s === ps) ? cierreDraw() : cierreRun(); }
  if (d.iaver) { e.stopPropagation(); return iaVer(d.iaver); }
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

/* ----- escuchar: el teléfono lee en voz alta los textos de la IA (voz del sistema, sin servidor ni costo) ----- */
const TTS = { on:'', txt:{}, auto:lsGet('ttsAuto') === '1', voice:null };
const ttsOk = () => typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
function ttsVoice(){
  if (TTS.voice || !ttsOk()) return TTS.voice;
  const vs = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang)); if (!vs.length) return null;
  const rank = v => (/premium|enhanced|mejorad|neural|natural/i.test(v.name) ? 0 : 10) + (['es-CO', 'es-MX', 'es-US', 'es-419'].indexOf(v.lang) + 1 || 5) + (v.localService ? 0 : 3);
  return (TTS.voice = vs.sort((a, b) => rank(a) - rank(b))[0]);
}
if (ttsOk()) speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => { TTS.voice = null; });
/* texto para el oído: sin símbolos de formato y con las cifras como pesos */
const ttsClean = s => String(s || '').replace(/\\n/g, '\n').replace(/\*\*|__|`/g, '').replace(/^#{1,4}\s*/gm, '')
  .replace(/(^|\s)[-•]\s+/g, '$1').replace(/\s*\n+\s*/g, '. ').replace(/−\s?\$|-\$/g, 'menos $')
  .replace(/\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(,\d+)?/g, (m, n) => n.replace(/\./g, '') + ' pesos').replace(/[✓✦○]/g, '').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
function ttsStop(){ if (ttsOk()) speechSynthesis.cancel(); TTS.on = ''; ttsSync(); }
function ttsSpeak(id, text){
  if (!ttsOk()) return toast('Este navegador no puede leer en voz alta');
  if (TTS.on === id) return ttsStop();
  speechSynthesis.cancel();
  /* en frases cortas: iOS a veces corta los textos largos */
  const parts = ttsClean(text).match(/[^.!?;:]+[.!?;:]*/g) || [];
  const v = ttsVoice(); TTS.on = id; ttsSync();
  parts.forEach((p, i) => { const u = new SpeechSynthesisUtterance(p.trim()); u.lang = v ? v.lang : 'es-CO'; if (v) u.voice = v; u.rate = 1.02;
    if (i === parts.length - 1) u.onend = u.onerror = () => { if (TTS.on === id) { TTS.on = ''; ttsSync(); } };
    speechSynthesis.speak(u); });
  if (!parts.length) { TTS.on = ''; ttsSync(); }
}
/* desbloquea la voz en iOS con un toque del usuario, para poder leer la respuesta cuando llegue */
function ttsUnlock(){ if (ttsOk() && !TTS.unlocked) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (_) {} TTS.unlocked = true; } }
const ICO_SPK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.6a7.5 7.5 0 0 1 0 10.8"/></svg>';
const ICO_STOP = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
function ttsBtn(id, text, label){
  if (!ttsOk() || !text) return '';
  TTS.txt[id] = text; const on = TTS.on === id;
  return '<button type="button" class="tts' + (label ? ' lbl' : '') + '" data-tts="' + esc(id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Detener lectura' : 'Escuchar') + '">' + (on ? ICO_STOP : ICO_SPK) + (label ? '<span>' + (on ? 'Detener' : 'Escuchar') + '</span>' : '') + '</button>';
}
function ttsSync(){ document.querySelectorAll('[data-tts]').forEach(b => { const on = b.dataset.tts === TTS.on, lbl = b.classList.contains('lbl');
  b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Detener lectura' : 'Escuchar'); b.innerHTML = (on ? ICO_STOP : ICO_SPK) + (lbl ? '<span>' + (on ? 'Detener' : 'Escuchar') + '</span>' : ''); }); }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-tts]'); if (b) { e.stopPropagation(); return ttsSpeak(b.dataset.tts, TTS.txt[b.dataset.tts]); }
  const a = e.target.closest('[data-ttsauto]'); if (a) { e.stopPropagation(); TTS.auto = !TTS.auto; lsSet('ttsAuto', TTS.auto ? '1' : '0'); if (TTS.auto) ttsUnlock(); else ttsStop(); render(); toast(TTS.auto ? 'Te leeré las respuestas en voz alta' : 'Respuestas solo en texto'); }
}, true);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && TTS.on) ttsStop(); });

/* ----- notas guardadas en Supabase (tabla ia_notas): lo aprendido, el resumen semanal, los cierres
   y lo que marcaste como "no aplica" en Para hoy (se comparte entre dispositivos) ----- */
let IAN = { semanal:null, guardados:[], hoyOff:{}, loaded:false };
/* análisis que se guardan para volver a leerlos sin gastar: resumen semanal y cierre */
const IA_GUARDA = { semanal:'Resumen de la semana', cierre:'Cierre del periodo' };
/* solo se conservan los del periodo anterior y el actual; lo más viejo se borra para no llenar la app.
   Para un periodo más antiguo, se le pregunta al asistente. */
const iaViejo = r => ((r.kind === 'cierre' && r.data && r.data.ps) || r.date) < period(-1).s;
async function iaNotesLoad(){
  if (typeof sb === 'undefined' || !sb || !session) return;
  const { data } = await sb.from('ia_notas').select('id,kind,date,sig,data,status').in('kind', ['aprendido', 'hoy', ...Object.keys(IA_GUARDA)]).order('date', { ascending:false }).order('id', { ascending:false }).limit(60);
  if (!data) return;
  const g = data.filter(r => IA_GUARDA[r.kind]), viejos = g.filter(iaViejo);
  IAN = { semanal:data.find(r => r.kind === 'semanal') || null, guardados:g.filter(r => !iaViejo(r)), hoyOff:((data.find(r => r.kind === 'hoy') || {}).data || {}).off || {}, loaded:true };
  const fa = data.find(r => r.kind === 'aprendido'); aprSet(fa); aprInicial(!!fa);
  if (viejos.length && S.transactions.length) sb.from('ia_notas').delete().in('id', viejos.map(r => r.id)).then(() => {}, () => {});
  render();
}
setTimeout(iaNotesLoad, 2500);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(iaNotesLoad, 800); });
async function iaNoteSet(rows){
  if (typeof sb === 'undefined' || !sb || !session || !rows.length) return;
  const now = new Date().toISOString();
  try { await sb.from('ia_notas').upsert(rows.map(r => ({ ...r, user_id:session.user.id, updated_at:now }))); } catch (_) {}
}
function iaGuardar(id, kind, data, sig){
  const row = { id, kind, date:iso(new Date()), sig:sig || null, data, status:'nueva' };
  IAN.guardados = [row].concat(IAN.guardados.filter(r => r.id !== id)); iaNoteSet([row]);
}
/* ----- metas ----- */
const metasList = () => (S.settings && Array.isArray(S.settings.metas)) ? S.settings.metas : [];
function accNetIn(id, p){ let v = 0; for (const t of S.transactions) if (inP(t, p) && !t.pending) {
  if (t.toAccountId === id) v += t.amount; if (t.accountId === id) v += t.type === 'ingreso' || t.type === 'ajuste' ? t.amount : -t.amount; } return v; }
function metaState(m){
  const B = balances(), saldo = m.acc ? Math.max(0, B[m.acc] || 0) : (+m.ahorrado || 0), falta = Math.max(0, (+m.monto || 0) - saldo);
  let meses = null; if (m.fecha) { const [y, mo] = m.fecha.split('-').map(Number), n = new Date(); meses = Math.max(1, (y - n.getFullYear()) * 12 + (mo - 1 - n.getMonth()) + (n.getDate() < 20 ? 1 : 0)); }
  const porMes = meses ? falta / meses : null;
  const aporte = m.acc ? [-1, -2, -3].map(k => accNetIn(m.acc, period(k))).reduce((a, v) => a + v, 0) / 3 : null;
  const pct = m.monto ? Math.min(1, saldo / m.monto) : 0;
  const estado = !falta ? 'lista' : porMes == null || aporte == null ? '' : aporte >= porMes * 0.95 ? 'al día' : 'atrasada';
  return { saldo, falta, meses, porMes, aporte, pct, estado };
}
function metasBlock(){
  const ms = metasList(); if (!ms.length) return '';
  return '\n## Sus metas (lo que más le importa lograr con su plata)\n' + ms.map(m => { const x = metaState(m);
    return '- ' + m.name + ': meta ' + COP(m.monto) + (m.fecha ? ' para ' + m.fecha : '') + '. Tiene ' + COP(x.saldo) + (m.acc ? ' en ' + accShort(m.acc) : '') + ', le faltan ' + COP(x.falta) +
      (x.porMes != null ? '; necesita apartar ' + COP(x.porMes) + ' por mes durante ' + x.meses + ' meses' : '') + (x.aporte != null ? '; viene aportando ~' + COP(x.aporte) + ' por periodo (promedio de los 3 últimos)' : '') + (x.estado ? ' → ' + x.estado.toUpperCase() : '') + '.'; }).join('\n') + '\n';
}
function aseState(){

  const p = period(0), pl = planFor(p), N = daysIn(p), ti = todayIdx(p), el = (ti + 1) / N, L = ['\n## Estado de hoy (cifras ya calculadas)'];
  if (pl) {
    const R = planReal(pl, p); let bud = 0, used = 0;
    L.push('Rubros de gasto del plan (nombre: gastado / tope, proyección al cierre si sigue al ritmo actual):');
    for (const i of pl.items.filter(isGastoItem)) { const b = itemBudget(pl, i, p), s = R.r[i.id] || 0; bud += b; used += s;
      L.push('- ' + i.name + ': ' + COP(s) + ' / ' + COP(b) + (isFijo(i) ? ' (pago fijo: ' + (fijoPaid(s, b) ? 'ya pagado' + (s < b ? ', costó ' + COP(b - s) + ' menos de lo planeado' : '') : 'pendiente de pagar') + ')' : ', proyección ' + COP(s / el) + (s > b ? ' (YA SE PASÓ ' + COP(s - b) + ')' : s / el > b * 1.05 ? ' (va a pasarse)' : ''))); }
    L.push('Te queda para gastar en el plan: ' + COP(bud - used) + ' en ' + (N - ti) + ' días.');
    L.push('Fuera del plan pagado del día a día (GTC o tarjeta): ' + COP(R.out) + '; fuera del plan pagado con ahorros (normal para él): ' + COP(R.fromSaved) + '. Por categoría (del día a día): ' + Object.entries(R.outCats).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => (k === '_' ? 'Sin categoría' : (cat(k) || {}).name) + ' ' + COP(v)).join(', '));
    const ah = pl.items.filter(i => !isGastoItem(i)); if (ah.length) L.push('Ahorros del plan este periodo: ' + ah.map(i => i.name + ' ' + COP(R.r[i.id] || 0) + ' de ' + COP(i.amount)).join('; '));
  }
  for (const a of S.accounts.filter(a => isCard(a) && !a.hidden)) { const B = balances(), d = Math.max(0, -(B[a.id] || 0)), pk = cardPocket(a); L.push('Tarjeta: debe ' + COP(d) + '; en ' + accShort(pk) + ' hay ' + COP(B[pk] || 0) + '; próximo pago el ' + (a.card.due ? nextDay(a.card.due).getDate() : '?') + '.'); }
  const mv = pendingMoves(); if (mv.length) L.push('Traslados pendientes por mover: ' + mv.map(t => COP(t.amount) + ' de ' + accShort(t.accountId) + ' a ' + accShort(t.toAccountId)).join('; '));
  const pend = S.transactions.filter(t => t.pending && t.type !== 'transferencia'); if (pend.length) L.push('Valores por confirmar: ' + pend.length);
  const bs = (S.bills || []).filter(b => b.active !== false).map(b => ({ b, c:billCycle(b) })).filter(x => !x.c.cy.paid && x.c.dDue <= 12);
  if (bs.length) L.push('Recibos por pagar pronto: ' + bs.map(x => x.b.name + ' ' + COP(x.c.amount) + ' vence en ' + x.c.dDue + ' días').join('; '));
  const d7 = iso(new Date(Date.now() - 7 * 864e5)), last7 = S.transactions.filter(t => t.date >= d7 && t.type === 'gasto');
  L.push('Últimos 7 días: ' + last7.length + ' gastos por ' + COP(last7.reduce((a, t) => a + t.amount, 0)) + '. Días sin ningún registro en la última semana: ' + [0,1,2,3,4,5,6].map(k => iso(new Date(Date.now() - k * 864e5))).filter(ds => !S.transactions.some(t => t.date === ds && t.type !== 'ajuste')).length + '.');
  return L.join('\n');
}
/* el resumen del domingo lo arma el servidor con el último contexto que dejó la app: se deja uno al día,
   sin IA y sin costo */
function ctxDiario(){
  const hoy = iso(new Date());
  if (!aiOn() || S.demo || !IAN.loaded || lsGet('ctxDia') === hoy) return;
  lsSet('ctxDia', hoy);
  iaNoteSet([{ id:'ctx', kind:'ctx', date:hoy, data:{ text:perfilBlock() + metasBlock() + askContext(true) + '\n' + aseState(), nombre:userName() }, status:'nueva' }]);
}

/* ----- Para hoy: lo que pide acción, calculado por Caudal con tus números de este momento (sin IA).
   Se recalcula con cada registro; lo que marques "No aplica" no vuelve a salir mientras siga igual
   (cada punto tiene una llave con su periodo, recibo o fecha de pago). ----- */
function hoyPuntos(){
  const P = [], p = period(0), pl = planFor(p), N = daysIn(p), ti = todayIdx(p), el = (ti + 1) / N;
  if (pl) {
    const R = planReal(pl, p);
    for (const i of pl.items.filter(i => isGastoItem(i) && !isFijo(i))) { const b = itemBudget(pl, i, p), g = R.r[i.id] || 0; if (!b) continue;
      if (g > b) P.push({ k:'plan:' + i.id + ':' + p.s + ':pasado', t:'alerta', txt:'<b>' + esc(i.name) + '</b>: te pasaste ' + money(g - b) + ' del tope (' + money(g) + ' de ' + money(b) + ').', go:'plan' });
      else if (el >= .2 && g / el > b * 1.05) P.push({ k:'plan:' + i.id + ':' + p.s, t:'aviso', txt:'<b>' + esc(i.name) + '</b> va a pasarse: llevas ' + money(g) + ' de ' + money(b) + ' y a este ritmo cierras en ' + money(g / el) + '.', go:'plan' }); }
  }
  for (const { b, c } of billList()) if (!c.cy.paid && c.dPay <= 5)
    P.push({ k:'bill:' + b.id + ':' + c.key, t:c.state === 'vencida' ? 'alerta' : 'aviso', txt:'<b>' + esc(b.name) + '</b>: ' + (c.real ? '' : '≈ ') + money(c.amount) + ', vence el ' + diaMes(c.due) + '.', btn:b.url ? ['data-billgo', b.id, 'Pagar ↗'] : ['data-billpay', b.id, 'Pagar'] });
  const B = balances();
  for (const a of S.accounts.filter(a => isCard(a) && !a.hidden && a.card.due)) {
    const debt = Math.max(0, -(B[a.id] || 0)), due = nextDay(a.card.due), dias = Math.round((due - new Date()) / 864e5); if (!debt || dias > 6) continue;
    const pk = cardPocket(a), falta = debt - (B[pk] || 0);
    P.push({ k:'card:' + a.id + ':' + iso(due), t:'aviso', txt:'<b>' + esc(a.name) + '</b>: debes ' + money(debt) + ', se paga el ' + diaMes(due) + '.' + (falta > 0 ? ' En ' + esc(accShort(pk)) + ' te faltan ' + money(falta) + '.' : ''), btn:['data-cardpay', a.id, 'Pagar tarjeta'] }); }
  const mv = pendingMoves(); if (mv.length) P.push({ k:'moves', t:'pendiente', txt:(mv.length === 1 ? 'Tienes 1 traslado' : 'Tienes ' + mv.length + ' traslados') + ' por mover a tus bolsillos (' + money(mv.reduce((a, t) => a + t.amount, 0)) + ').', go:'inicio' });
  const pend = S.transactions.filter(t => t.pending && t.type !== 'transferencia').length;
  if (pend) P.push({ k:'pend', t:'pendiente', txt:(pend === 1 ? '1 valor' : pend + ' valores') + ' por confirmar.', go:'inicio' });
  for (const m of metasList()) { const x = metaState(m); if (x.estado === 'atrasada') P.push({ k:'meta:' + m.name + ':' + p.s, t:'aviso', txt:'Meta <b>' + esc(m.name) + '</b> va atrasada: necesitas ' + money(x.porMes) + ' por mes y vienes aportando ' + money(x.aporte) + '.', go:'plan' }); }
  return P;
}
function paraHoyCard(){
  ctxDiario();
  const p = period(0), pl = planFor(p), off = IAN.hoyOff || {}, todos = hoyPuntos(), P = todos.filter(x => !off[x.k]);
  let titular = '';
  if (pl) { const R = planReal(pl, p), items = pl.items.filter(isGastoItem), bud = items.reduce((a, i) => a + itemBudget(pl, i, p), 0), used = items.reduce((a, i) => a + (R.r[i.id] || 0), 0), dias = daysIn(p) - todayIdx(p);
    titular = 'Te quedan <b>' + money(Math.max(0, bud - used)) + '</b> del plan para ' + dias + (dias === 1 ? ' día.' : ' días.'); }
  const ico = { alerta:['!', 'var(--neg)'], aviso:['!', 'var(--warn)'], pendiente:['○', 'var(--muted)'] }, ver = { plan:'Ver plan', inicio:'Ver en Inicio' };
  let h = '<section class="card"><div class="card-h"><h2>Para hoy</h2></div>' + (titular ? '<p class="insight" style="margin:0 0 6px">' + titular + '</p>' : '');
  if (!P.length) return h + '<div class="ase-p"><span class="ase-i" style="color:var(--pos)">✓</span><div class="ase-t"><span>Nada pendiente: el plan va en orden y no hay pagos en los próximos días.</span></div></div></section>';
  h += P.map(x => { const [i, col] = ico[x.t];
    return '<div class="ase-p"><span class="ase-i" style="color:' + col + '">' + i + '</span><div class="ase-t"><span>' + x.txt + '</span><div class="ase-a">' +
      (x.btn ? '<button class="pill solid" ' + x.btn[0] + '="' + esc(x.btn[1]) + '">' + x.btn[2] + '</button>' : '') + (x.go ? '<button class="pill" data-go="' + x.go + '">' + ver[x.go] + '</button>' : '') +
      '<button class="lnk2" data-hoyoff="' + esc(x.k) + '">No aplica</button></div></div></div>'; }).join('');
  return h + '</section>';
}
/* "No aplica": se guarda en la nube; las llaves que ya no existen se limpian para no acumular */
document.addEventListener('click', e => { const b = e.target.closest('[data-hoyoff]'); if (!b) return; e.stopPropagation();
  const vivas = new Set(hoyPuntos().map(x => x.k)), off = {};
  for (const k in IAN.hoyOff || {}) if (vivas.has(k)) off[k] = 1;
  off[b.dataset.hoyoff] = 1; IAN.hoyOff = off;
  iaNoteSet([{ id:'hoy-off', kind:'hoy', date:iso(new Date()), data:{ off }, status:'nueva' }]); render(); toast('Listo: no te lo muestro de nuevo'); }, true);

/* ----- resumen semanal (lo arma el servidor el domingo y llega por notificación) ----- */
function semanalCard(){
  const s = IAN.semanal; if (!s || S.demo || ui.offset !== 0) return '';
  /* solo cuando se abre desde la notificación del domingo; después queda en los análisis guardados */
  if (!/[?&]semanal=1/.test(location.search) || lsGet('semanalVisto') === s.id) return '';
  const d = s.data || {};
  return '<section class="card glow semcard"><div class="card-h"><h2>' + esc(d.titulo || 'Tu semana') + '</h2>' + (ttsBtn('sem', (d.titulo || 'Tu semana') + '. ' + (d.resumen || ''), true) || SPARK) + '</div>' + semanalBody(d.resumen || '') +
    '<p class="note" style="padding:0;margin:8px 0 0">Queda guardado en Asistente › Tus análisis guardados.</p><div class="semact"><button class="btn sm ghost" data-semvisto="' + esc(s.id) + '">Listo</button><button class="btn sm" data-go="asistente">Preguntar algo</button></div></section>';
}
/* el resumen llega como texto con viñetas: cada viñeta se muestra como tarjeta pequeña.
   Color con intención: ámbar si pide acción, verde si es un logro. Si la viñeta trae un porcentaje, lleva barra. */
function semanalBody(txt){
  const lines = String(txt).split('\n').map(l => l.trim()).filter(Boolean);
  const bul = lines.filter(l => /^[-•]\s*/.test(l)), intro = lines.filter(l => !/^[-•]\s*/.test(l));
  if (!bul.length) return '<div class="answer" style="margin:0">' + mdLite(txt) + '</div>';
  const tone = l => /(pasarse|se pasa|sube el tope|pendiente|márcalo|marcalo|haz el paso|debe |revisa)/i.test(l) ? 'warn' : /(completos?|completas?|¡lista|cumplid)/i.test(l) ? 'pos' : '';
  const card = l => { const t = l.replace(/^[-•]\s*/, ''), m = t.match(/\((\d{1,3})\s*%/), pc = m ? Math.min(100, +m[1]) : null, tn = tone(t);
    return '<div class="sbul ' + tn + '"><p>' + mdLite(t) + '</p>' + (pc !== null ? '<div class="btrack"><div class="fill ' + (+m[1] > 100 ? 'neg' : tn) + '" style="width:' + pc + '%"></div></div>' : '') + '</div>'; };
  return (intro.length ? '<p class="semintro">' + mdLite(intro.join(' ')) + '</p>' : '') + '<div class="sgrid">' + bul.map(card).join('') + '</div>';
}
document.addEventListener('click', e => { const b = e.target.closest('[data-semvisto]'); if (!b) return; e.stopPropagation(); lsSet('semanalVisto', b.dataset.semvisto); if (/semanal=1/.test(location.search)) history.replaceState(null, '', location.pathname); render(); }, true);

/* ----- metas: tarjeta en Plan y hoja para crear o editar ----- */
function metasCard(){
  const ms = metasList();
  let h = '<section class="card"><div class="card-h"><h2>Tus metas</h2><button class="pill" data-metanew>Nueva</button></div>';
  if (!ms.length) return h + '<p class="insight">Pon lo que quieres lograr (la moto, un viaje, un fondo para la mudanza) con su monto y fecha. El asistente calcula cuánto apartar cada mes y te avisa si vas atrasado.</p></section>';
  h += ms.map(m => { const x = metaState(m);
    return '<button class="goal" data-metaed="' + esc(m.id) + '"><div class="goal-h"><b>' + esc(m.name) + '</b><span class="num">' + money(x.saldo) + ' de ' + money(m.monto) + '</span></div>' +
      '<div class="btrack"><div class="fill" style="width:' + (x.pct * 100).toFixed(1) + '%"></div></div>' +
      '<span class="goal-s">' + (x.estado === 'lista' ? '<b class="pos">¡Lista!</b>' : (x.porMes != null ? 'Aparta ' + money(x.porMes) + ' al mes' + (m.fecha ? ' hasta ' + MES[+m.fecha.slice(5) - 1] + ' ' + m.fecha.slice(0, 4) : '') : 'Faltan ' + money(x.falta)) +
      (x.estado ? ' · <b class="' + (x.estado === 'al día' ? 'pos' : 'warn') + '">' + x.estado + '</b>' : '')) + '</span></button>'; }).join('');
  return h + '</section>';
}
let MF = null;
function metaSheet(m){
  MF = m ? { ...m } : { id:uid(), name:'', monto:0, fecha:'', acc:'', ahorrado:0, nueva:true };
  const accs = S.accounts.filter(a => !a.hidden && !isCard(a));
  openSheet('<div class="sheet-h"><b id="sheet-title">' + (MF.nueva ? 'Nueva meta' : 'Editar meta') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><form class="form" id="metaf" novalidate>' +
    '<div class="field"><label class="label" for="m-name">Qué quieres lograr</label><input class="inp" id="m-name" value="' + esc(MF.name) + '" placeholder="Ej. Moto nueva" autocomplete="off"></div>' +
    '<div class="two"><div class="field"><label class="label" for="m-monto">Cuánto necesitas</label><input class="inp num" id="m-monto" inputmode="numeric" value="' + (MF.monto ? nf.format(MF.monto) : '') + '" placeholder="0"></div>' +
    '<div class="field"><label class="label" for="m-fecha">Para cuándo</label><input class="inp" type="month" id="m-fecha" value="' + esc(MF.fecha || '') + '"></div></div>' +
    '<div class="field"><label class="label" for="m-acc">Dónde la ahorras</label><select class="inp" id="m-acc"><option value="">No tiene cuenta propia</option>' + accs.map(a => '<option value="' + esc(a.id) + '"' + (MF.acc === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>').join('') + '</select>' +
    '<span class="tile-s">Si eliges un bolsillo, el avance es su saldo.</span></div>' +
    '<div class="field" id="m-ah-f"' + (MF.acc ? ' hidden' : '') + '><label class="label" for="m-ah">Lo que ya tienes ahorrado</label><input class="inp num" id="m-ah" inputmode="numeric" value="' + (MF.ahorrado ? nf.format(MF.ahorrado) : '') + '" placeholder="0"></div>' +
    '<div class="err" id="m-err"></div><button class="btn accent block" type="submit">Guardar meta</button>' + (MF.nueva ? '' : '<button class="btn ghost block" type="button" data-metadel>Eliminar meta</button>') + '</form>');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-metanew],[data-metaed],[data-metadel]'); if (!b) return; e.stopPropagation();
  if (b.dataset.metanew !== undefined) return metaSheet(null);
  if (b.dataset.metaed) return metaSheet(metasList().find(m => m.id === b.dataset.metaed));
  if (b.dataset.metadel !== undefined && MF) { S.settings.metas = metasList().filter(m => m.id !== MF.id); save(); closeSheet(); render(); toast('Meta eliminada'); }
}, true);
document.addEventListener('change', e => { if (e.target.id === 'm-acc') { const f = $('#m-ah-f'); if (f) f.hidden = !!e.target.value; } });
document.addEventListener('input', e => { if (e.target.id === 'm-monto' || e.target.id === 'm-ah') { const v = pesosCampo(e.target); } });
document.addEventListener('submit', e => {
  if (e.target.id !== 'metaf' || !MF) return; e.preventDefault(); e.stopPropagation();
  const num = id => leerPesos($('#' + id).value);
  const m = { id:MF.id, name:$('#m-name').value.trim(), monto:num('m-monto'), fecha:$('#m-fecha').value || '', acc:$('#m-acc').value || '', ahorrado:num('m-ah') };
  if (!m.name) return $('#m-err').textContent = 'Ponle un nombre.';
  if (!m.monto) return $('#m-err').textContent = 'Escribe cuánto necesitas.';
  if (m.acc) delete m.ahorrado;
  const list = metasList().filter(x => x.id !== m.id); list.push(m); S.settings.metas = list; save(); closeSheet(); render(); toast('Meta guardada');
}, true);

/* ----- lo que el asistente debe saber de ti (perfil) ----- */
/* reglas que la persona haya escrito antes (ya no se piden: el asistente aprende solo, ver aprendizaje.js) */
const perfilTxt = () => (S.settings && S.settings.perfil) || '';
const perfilBlock = () => (perfilTxt() ? '\n## Cómo maneja su plata (contado por el usuario; tenlo siempre en cuenta)\n' + perfilTxt() + '\n' : '') + habitosBlock() + aprBlock();

/* ----- consumo de IA y créditos ----- */
let IAU = null;
async function iaUsageLoad(){
  if (typeof sb === 'undefined' || !sb || !session) return;
  const m0 = new Date(); m0.setDate(1); m0.setHours(0, 0, 0, 0);
  const sal = S.settings.iaSaldo, from = sal && sal.date && new Date(sal.date) < m0 ? new Date(sal.date) : m0;
  const { data } = await sb.from('ia_usage').select('at,usd,error').gte('at', from.toISOString()).order('at', { ascending:false }).limit(5000);
  if (!data) return;
  const month = data.filter(r => new Date(r.at) >= m0).reduce((a, r) => a + +r.usd, 0);
  const since = sal && sal.date ? data.filter(r => new Date(r.at) >= new Date(sal.date)).reduce((a, r) => a + +r.usd, 0) : null;
  const noCred = data.some(r => r.error === 'sin_creditos' && Date.now() - new Date(r.at) < 2 * 864e5) && !(sal && sal.date && data.find(r => r.error === 'sin_creditos' && new Date(r.at) < new Date(sal.date)));
  IAU = { month, left:sal ? sal.usd - since : null, noCred };
  render();
}
setTimeout(iaUsageLoad, 5000);
function iaBanner(){
  if (!IAU || S.demo) return '';
  if (IAU.noCred) return '<div class="banner"><span><b>Se acabaron los créditos de la IA.</b> Registrar sigue funcionando, pero sin IA. Recarga en console.anthropic.com y anótalo en Ajustes.</span><button class="btn sm" data-go="ajustes" data-sec="asistente">Ajustes</button></div>';
  if (IAU.left != null && IAU.left < 1) return '<div class="banner"><span><b>Te quedan unos US$' + Math.max(0, IAU.left).toFixed(2).replace('.', ',') + ' de créditos de IA.</b> Recarga pronto en console.anthropic.com.</span><button class="btn sm" data-go="ajustes" data-sec="asistente">Ver</button></div>';
  return '';
}
function iaCard(){
  if (!aiOn() || S.demo) return '';
  const sal = S.settings.iaSaldo, f = v => 'US$' + v.toFixed(2).replace('.', ',');
  return '<section class="card"><div class="card-h"><h2>Tu asistente</h2>' + SPARK + '</div>' +
    '<p class="insight" style="margin:0 0 8px">Aprende solo: de tu configuración, de tus movimientos, de lo que le cuentas al conversar y de cada cierre. No tienes que escribir nada.</p>' + aprAjustes() +
    '<div class="set" style="margin-top:8px"><div class="t"><b>Consumo de IA este mes</b><span>' + (IAU ? f(IAU.month) : 'Cargando…') + '</span></div></div>' +
    '<div class="set"><div class="t"><b>Créditos que te quedan</b><span>' + (IAU && IAU.left != null ? '≈ ' + f(Math.max(0, IAU.left)) + ' (recargaste ' + f(sal.usd) + ' el ' + fmtShort(new Date(sal.date)) + ')' : 'Anota cuánto tienes para que te avise antes de que se acaben') + '</span></div></div>' +
    '<div class="two"><input class="inp num" id="iasaldo" inputmode="decimal" placeholder="Saldo actual en US$"><button class="btn" data-iasaldo>Anotar</button></div>' +
    '<p class="note" style="padding:0">Míralo en console.anthropic.com, en Billing. Si se acaban, registrar sigue funcionando sin IA y te aviso en Inicio.</p></section>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.dataset.iasaldo !== undefined) { e.stopPropagation(); const v = parseFloat(String($('#iasaldo').value || '').replace(',', '.')); if (!(v >= 0)) return toast('Escribe el saldo en dólares, por ejemplo 4,50');
    S.settings.iaSaldo = { usd:v, date:new Date().toISOString() }; save(); IAU = IAU && { ...IAU, noCred:false }; toast('Anotado'); return iaUsageLoad(); }
}, true);
