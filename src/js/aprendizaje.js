/* Aprendizaje del asistente: conoce tus hábitos sin que tengas que escribirlos.
   1. Hábitos calculados: Caudal los saca de tus movimientos cada vez que la IA trabaja. No gastan créditos.
   2. Aprendido: lo que la IA detecta al conversar contigo o al hacer el cierre del periodo. Viaja dentro de
      respuestas que ya se iban a pedir (no hay llamadas extra), se guarda en ia_notas (kind 'aprendido')
      y se comparte entre dispositivos. En Ajustes se ve la lista y se puede borrar lo que no sea cierto. */
const APR_MAX = 15;
let APR = []; /* [{ t:texto, d:fecha, f:'chat'|'cierre' }] */
const aprSet = row => { APR = ((row && row.data) || {}).items || []; };
function aprGuardar(){ iaNoteSet([{ id:'aprendido', kind:'aprendido', date:iso(new Date()), data:{ items:APR }, status:'nueva' }]); }
/* suma lo nuevo sin repetir lo que ya sabe; si se llena, se va lo más viejo */
function aprAdd(lista, f){
  const ya = new Set(APR.map(x => norm(x.t))), nuevos = (lista || []).map(x => String(x || '').trim().replace(/\s+/g, ' ').slice(0, 220)).filter(x => x.length > 8 && !ya.has(norm(x)));
  if (!nuevos.length) return;
  APR = APR.concat(nuevos.map(t => ({ t, d:iso(new Date()), f }))).slice(-APR_MAX); aprGuardar();
}
/* el chat marca lo que vale la pena recordar con [[recordar: ...]]; se guarda y se quita del texto visible */
function aprDeTexto(text){
  const hall = []; const limpio = String(text || '').replace(/\[\[recordar:\s*([^\]]+)\]\]/gi, (_, x) => { hall.push(x); return ''; }).trim();
  aprAdd(hall, 'chat'); return limpio;
}
const APR_CHAT = '\nAprendizaje: si en la conversación te cuenta algo duradero sobre cómo maneja su plata (una regla, un hábito, una preferencia) que no esté ya en su perfil ni en lo aprendido, agrega al final una línea aparte con [[recordar: frase corta en tercera persona]]. Máximo una por respuesta y solo si es duradero; no repitas cifras que Caudal ya calcula.';
function aprBlock(){ return APR.length ? '\n## Lo que has aprendido de él (de conversaciones y cierres anteriores)\n' + APR.map(x => '- ' + x.t).join('\n') + '\n' : ''; }

/* ----- hábitos calculados de sus datos (sin IA) ----- */
const mediana = v => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)] || 0; };
function habitosLista(){
  const H = [], hoy = new Date(), desde = iso(new Date(hoy.getTime() - 90 * 864e5));
  /* sueldo: qué días llega y a qué cuenta */
  const an = salaryAnchors().slice(-6), sc = salaryCat();
  if (an.length >= 2) { const ds = an.map(d => parseISO(d).getDate()), t = sc && S.transactions.find(x => x.type === 'ingreso' && x.categoryId === sc.id);
    H.push('El sueldo le ha llegado entre el día ' + Math.min(...ds) + ' y el ' + Math.max(...ds) + ' del mes (últimos ' + an.length + ': ' + ds.join(', ') + ')' + (t ? ', a ' + accShort(t.accountId) : '') + '.'); }
  /* rubros del plan: dónde suele pasarse o sobrarle en los 3 periodos cerrados */
  const pl = planFor(period(0)), RP = [-1, -2, -3].map(period).map(p => { const q = planFor(p); return q ? { p, q, R:planReal(q, p) } : null; }).filter(Boolean);
  if (pl) for (const i of pl.items.filter(x => isGastoItem(x) && !isFijo(x))) {
    const r = RP.map(({ p, q, R }) => { const it = q.items.find(y => y.name === i.name); if (!it) return null; const b = itemBudget(q, it, p); return b ? { s:R.r[it.id] || 0, b } : null; }).filter(Boolean);
    if (r.length < 2) continue;
    const pasa = r.filter(x => x.s > x.b * 1.05).length, sobra = r.filter(x => x.s > 0 && x.s < x.b * 0.7).length, prom = r.reduce((a, x) => a + x.s, 0) / r.length;
    if (pasa >= 2) H.push('En ' + i.name + ' suele pasarse: gasta en promedio ' + COP(prom) + ' con tope de ' + COP(i.amount) + ' (' + pasa + ' de ' + r.length + ' periodos).');
    else if (sobra >= 2) H.push('En ' + i.name + ' suele sobrarle: gasta en promedio ' + COP(prom) + ' de ' + COP(i.amount) + '.');
  }
  /* conceptos frecuentes de los últimos 3 meses */
  const g = S.transactions.filter(t => t.type === 'gasto' && t.date >= desde && !esDeuda(accById(t.accountId)) && t.note), m = {};
  for (const t of g) { const k = norm(t.note); if (k) (m[k] = m[k] || { n:t.note, v:[], acc:{} }).v.push(t.amount), m[k].acc[t.accountId] = (m[k].acc[t.accountId] || 0) + 1; }
  const top = Object.values(m).filter(x => x.v.length >= 4).sort((a, b) => b.v.length - a.v.length).slice(0, 6);
  if (top.length) H.push('Gastos frecuentes (3 meses): ' + top.map(x => x.n + ' ' + x.v.length + ' veces, típico ' + COP(mediana(x.v)) + ' con ' + accShort(Object.entries(x.acc).sort((a, b) => b[1] - a[1])[0][0])).join('; ') + '.');
  /* días de la semana con más gasto del día a día */
  const dw = [0, 0, 0, 0, 0, 0, 0], tot = g.reduce((a, t) => (dw[parseISO(t.date).getDay()] += t.amount, a + t.amount), 0);
  const DIAS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  if (g.length >= 20) { const o = dw.map((v, k) => [k, v]).sort((a, b) => b[1] - a[1]).slice(0, 2), pc = Math.round((o[0][1] + o[1][1]) / tot * 100);
    if (pc >= 40) H.push('Gasta más los ' + DIAS[o[0][0]] + ' y los ' + DIAS[o[1][0]] + ' (' + pc + '% de lo que tiene nota en 3 meses).'); }
  /* fuera del plan y Excedentes en los periodos cerrados */
  { const R = RP.map(x => x.R);
    if (R.length) { const sv = R.reduce((a, x) => a + x.fromSaved + x.exc, 0) / R.length, fu = R.reduce((a, x) => a + x.out, 0) / R.length;
      if (sv >= 20000) H.push('Por periodo paga en promedio ' + COP(sv) + ' con sus ahorros o Excedentes (fuera del plan, es normal para él).');
      if (fu >= 20000) H.push('Por periodo gasta en promedio ' + COP(fu) + ' fuera del plan desde el día a día.'); } }
  /* deudas: cuántas y cuánto tarda en saldarlas */
  const dd = deudasTodas().filter(x => x.t.date >= desde);
  if (dd.length) { const cerr = dd.filter(x => !x.falta && x.abonos.length), dias = cerr.map(x => Math.round((parseISO(x.abonos[x.abonos.length - 1].date) - parseISO(x.t.date)) / 864e5));
    const np = dd.filter(x => x.k === 'pagar').length, nc = dd.length - np, cuenta = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
    H.push('En 3 meses tuvo ' + cuenta(np, 'deuda por pagar', 'deudas por pagar') + ' y ' + cuenta(nc, 'préstamo', 'préstamos') + (dias.length ? '; suele saldarlas en ' + mediana(dias) + ' días' : '') + '.'); }
  return H;
}
function habitosBlock(){ const h = habitosLista(); return h.length ? '\n## Hábitos que Caudal observa en sus datos (calculado, confiable)\n' + h.map(x => '- ' + x).join('\n') + '\n' : ''; }

/* ----- en Ajustes: lo que sabe, para revisarlo y borrar lo que no sea cierto ----- */
function aprAjustes(){
  const h = habitosLista();
  return '<div class="field"><span class="label">Lo que ha aprendido de ti</span>' +
    (APR.length ? APR.map((x, i) => '<div class="set"><div class="t"><b style="font-weight:400">' + esc(x.t) + '</b><span>' + (x.f === 'cierre' ? 'Del cierre' : 'De una conversación') + ' · ' + fmtShort(parseISO(x.d)) + '</span></div><button class="pill" data-aprdel="' + i + '" aria-label="Olvidar">✕</button></div>').join('')
      : '<p class="note" style="padding:0">Aún nada. Aprende cuando conversas con el asistente y en cada cierre del periodo.</p>') +
    (h.length ? '<details class="howto"><summary>Hábitos que calcula de tus datos (' + h.length + ')</summary><div>' + h.map(x => '<p style="margin:0 0 6px">' + esc(x) + '</p>').join('') + '</div></details>' : '') + '</div>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-aprdel]'); if (!b) return; e.stopPropagation();
  APR.splice(+b.dataset.aprdel, 1); aprGuardar(); render(); toast('Olvidado');
}, true);
