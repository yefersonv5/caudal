/* ---------- Cuadrar cuentas: comparar con el saldo real del banco y encontrar el descuadre ---------- */
let CQ = null, CQ_RET = null;
function lastCuadre(id){
  let l = null;
  for (const t of S.transactions) if (t.type === 'ajuste' && t.src === 'cuadre' && t.accountId === id && (!l || t.date > l.date || (t.date === l.date && (t.ts || 0) > (l.ts || 0)))) l = t;
  return l;
}
const daysAgo = ds => Math.round((parseISO(iso(new Date())) - parseISO(ds)) / 864e5);
function cuadreTxt(id){
  const l = lastCuadre(id); if (!l) return 'Sin cuadrar';
  const d = daysAgo(l.date); return d <= 0 ? 'Cuadrada hoy' : d === 1 ? 'Cuadrada ayer' : 'Cuadrada hace ' + d + ' días';
}
const hiddenTx = t => t.type === 'ajuste' && !t.amount; // marcas de cuadre sin diferencia

function accSheet(id, prefill){
  const a = accById(id); if (!a) return;
  if (esDeuda(a)) return deudaCuentaSheet(a.debt); /* Por pagar y Por cobrar muestran cada concepto, no un cuadre con el banco */
  const bal = balances()[id] || 0;
  CQ = { id, sign: bal < 0 ? -1 : 1 };
  let h = '<div class="sheet-h"><b id="sheet-title">' + esc(a.name) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form cq">';
  h += '<section class="card glow" style="padding:16px"><span class="label">Saldo en Caudal</span><div class="tile-v num ' + (bal < 0 ? 'neg' : '') + '">' + money(bal) + '</div><span class="tile-s">' + cuadreTxt(id) + '</span></section>';
  const ask = prefill == null;
  if (ask) h += '<p class="insight" style="margin:0">¿Coincide con lo que ves en el banco?</p><div class="two" id="cq-ask"><button class="btn accent" type="button" data-cqok>Sí, coincide</button><button class="btn ghost" type="button" data-cqno>No, es otro</button></div>';
  h += '<div id="cq-form"' + (ask ? ' hidden' : '') + ' style="display:' + (ask ? 'none' : 'flex') + ';flex-direction:column;gap:12px">';
  h += '<div class="field"><label class="label" for="cq-real">¿Cuánto tiene de verdad?</label><input class="inp num" id="cq-real" inputmode="numeric" autocomplete="off" placeholder="Mira el saldo en la app del banco" value="' + (prefill != null ? nf.format(Math.abs(prefill)) : '') + '"></div>';
  if (bal < 0) h += '<div class="seg" role="group" aria-label="Tipo de saldo"><button type="button" data-cqsign="-1" aria-pressed="true">Es deuda</button><button type="button" data-cqsign="1" aria-pressed="false">Saldo a favor</button></div>';
  h += '<button class="btn accent block" type="button" data-cqgo>Comparar</button></div><div id="cq-res"></div>';
  if (!isCard(a)) h += '<button type="button" class="pill" style="align-self:flex-start" data-accapart="' + esc(id) + '" aria-pressed="' + !a.apart + '">' + (a.apart ? '○ Apartada: no cuenta en tu disponible' : '● Cuenta en tu disponible') + '</button>';
  const recent = S.transactions.filter(t => (t.accountId === id || t.toAccountId === id) && !hiddenTx(t)).slice(0, 8);
  if (recent.length) h += '<section class="card" style="padding:12px 16px"><div class="card-h"><h2 style="font-size:15px">Últimos movimientos</h2></div>' + recent.map(txRow).join('') + '</section>';
  h += '<button class="btn ghost block" type="button" data-cqlist="' + esc(id) + '">Ver todos sus movimientos</button></div>';
  openSheet(h);
  if (prefill != null) { if (prefill < 0) CQ.sign = -1; cqCompare(); }
}

function cqCompare(){
  const res = $('#cq-res'); if (!res || !CQ) return;
  const raw = ($('#cq-real').value || '').replace(/\D/g, '');
  if (!raw) { res.innerHTML = '<div class="err">Escribe el saldo que ves en el banco.</div>'; return; }
  const id = CQ.id, bal = balances()[id] || 0, real = parseInt(raw, 10) * CQ.sign, diff = real - bal;
  CQ.real = real; CQ.diff = diff;
  const l = lastCuadre(id), since = l ? l.date : iso(new Date(Date.now() - 30 * 864e5));
  const mv = S.transactions.filter(t => t.date >= since && (t.accountId === id || t.toAccountId === id) && !hiddenTx(t));
  let h = '';
  if (!diff) {
    h += '<section class="card" style="padding:16px"><b class="pos">Cuadra exacto ✓</b><p class="insight" style="margin:6px 0 0">Caudal y el banco dicen lo mismo.</p></section>' +
      '<button class="btn accent block" type="button" data-cqok>Marcar como cuadrada</button>';
    res.innerHTML = h; return;
  }
  const falta = diff < 0, D = Math.abs(diff);
  h += '<section class="card" style="padding:16px"><span class="label">Diferencia</span><div class="tile-v num ' + (falta ? 'neg' : '') + '">' + money(D) + '</div><span class="tile-s">' +
    (falta ? 'En Caudal hay de más. Casi siempre es un gasto que no anotaste o uno anotado dos veces.' : 'En Caudal hay de menos. Puede ser un ingreso sin anotar, un gasto repetido o anotado en esta cuenta por error.') + '</span></section>';

  /* pistas */
  const pistas = [];
  const g = {}; for (const t of mv) if (t.accountId === id) { const k = t.type + '|' + t.amount + '|' + t.date; (g[k] = g[k] || []).push(t); }
  const dups = Object.values(g).filter(x => x.length > 1).flat();
  if (dups.length) pistas.push(['Posibles repetidos: mismo valor y mismo día', dups]);
  const same = mv.filter(t => t.amount === D && !dups.includes(t));
  if (same.length) pistas.push(['Tienen el mismo valor de la diferencia', same]);
  const other = S.transactions.filter(t => t.date >= since && t.amount === D && (t.type === 'gasto' || t.type === 'ingreso') && t.accountId !== id);
  if (other.length) pistas.push(['¿Quedó anotado en otra cuenta?', other]);
  const pend = S.transactions.filter(t => t.pending && (t.accountId === id || t.toAccountId === id));
  if (pend.length) pistas.push(['Por confirmar: el valor real puede ser otro', pend]);
  /* en la tarjeta, un gasto anotado a mano que nunca pasó por ella infla la deuda; ajustarlo deja plata que no existe en otra cuenta */
  const tc = isCard(accById(id)), mano = tc ? mv.filter(t => t.accountId === id && t.type === 'gasto' && t.src !== 'banco' && !dups.includes(t)) : [];
  if (mano.length) pistas.push(['Anotados a mano en la tarjeta: ¿de verdad se pagaron con ella?', mano]);
  if (pistas.length) h += '<section class="card" style="padding:16px"><h2 style="margin:0 0 6px;font-size:15px">Pistas</h2>' +
    pistas.map(([tt, list]) => '<p class="note" style="padding:0;margin:10px 0 2px">' + tt + '</p>' + list.slice(0, 8).map(txRow).join('')).join('') + '</section>';

  /* acciones */
  h += falta
    ? '<button class="btn accent block" type="button" data-cqadd="gasto">Registrar el gasto que falta</button><button class="btn block" type="button" data-cqunk>Anotarlo como gasto sin identificar</button>'
    : '<button class="btn accent block" type="button" data-cqadd="ingreso">Registrar el ingreso que falta</button>';
  h += '<button class="btn ghost block" type="button" data-cqadj>Solo ajustar el saldo</button>' +
    '<p class="note" style="padding:0">' + (falta ? '"Gasto sin identificar" cuenta en tus gastos del mes; "ajustar" no. ' : '') + (tc ? 'En la tarjeta, ajustar no saca la plata de ningún lado: si un gasto se pagó con otra cuenta, cámbiale la cuenta para que el sobrante del mes sea real. ' : '') + 'Toca un movimiento para corregirlo; al guardar vuelves aquí.</p>';

  h += cqAiBox();
  h += '<section class="card" style="padding:16px"><div class="card-h"><h2 style="font-size:15px">Movimientos desde ' + (l ? 'el último cuadre' : 'hace 30 días') + '</h2><span class="aside">' + mv.length + '</span></div>' +
    (mv.length ? mv.slice(0, 40).map(txRow).join('') : '<div class="empty">No hay movimientos en este tiempo.</div>') + '</section>';
  res.innerHTML = h;
}

function cqMark(amount, msg){
  S.transactions.push({ id:uid(), type:'ajuste', amount, date:iso(new Date()), ts:Date.now(), accountId:CQ.id, note:'Cuadre de cuenta', src:'cuadre' });
  sortTx(S); save(); closeSheet(); render(); toast(msg);
}

function cuadreReminder(){
  return ''; // reemplazado por el cuadre mensual con captura (antes de pagar la tarjeta)
  if (S.demo || !(S.transactions || []).length) return '';
  try { if (localStorage.getItem('caudal.cqlater') === iso(new Date())) return ''; } catch (_) {}
  const since = iso(new Date(Date.now() - 30 * 864e5)), act = new Set();
  for (const t of S.transactions) if (t.date >= since && t.type !== 'ajuste') { act.add(t.accountId); if (t.toAccountId) act.add(t.toAccountId); }
  const due = S.accounts.filter(a => !a.hidden && act.has(a.id)).filter(a => { const l = lastCuadre(a.id); return !l || daysAgo(l.date) >= 7; });
  if (!due.length) return '';
  const names = due.slice(0, 3).map(a => a.name).join(', ') + (due.length > 3 ? ' y ' + (due.length - 3) + ' más' : '');
  const never = due.every(a => !lastCuadre(a.id));
  return '<div class="banner"><span><b>' + (never ? 'Cuadra tus cuentas' : 'Más de una semana sin cuadrar') + ':</b> ' + esc(names) + '. Compara con el saldo del banco para no acumular descuadres.</span>' +
    '<span style="display:flex;gap:6px"><button class="btn sm ghost" data-cqlater>Hoy no</button><button class="btn sm" data-go="cuentas">Cuadrar</button></span></div>';
}

document.addEventListener('input', e => {
  if (e.target.id !== 'cq-real') return;
  pesosCampo(e.target);
});
document.addEventListener('keydown', e => { if (e.target.id === 'cq-real' && e.key === 'Enter') { e.preventDefault(); cqCompare(); } });
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const d = el.dataset;
  if (d.accsheet) { e.stopPropagation(); return accSheet(d.accsheet); }
  if (d.accapart) { e.stopPropagation(); const a = accById(d.accapart); if (a) { a.apart = !a.apart; save(); render(); accSheet(a.id); toast(a.apart ? 'Ya no cuenta en tu disponible' : 'Cuenta en tu disponible'); } return; }
  if (d.cqlater !== undefined) { e.stopPropagation(); try { localStorage.setItem('caudal.cqlater', iso(new Date())); } catch (_) {} return render(); }
  if (!CQ || !el.closest('.cq')) return;
  if (d.tx) { CQ_RET = ((id, real) => () => accSheet(id, real))(CQ.id, CQ.real); return; } // el manejador general abre el movimiento
  e.stopPropagation();
  if (d.cqsign) { CQ.sign = +d.cqsign; el.parentNode.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el)); if (CQ.real != null) cqCompare(); return; }
  if (d.cqgo !== undefined) return cqCompare();
  if (d.cqno !== undefined) { const f = $('#cq-form'), q = $('#cq-ask'); if (q) q.remove(); if (f) { f.hidden = false; f.style.display = 'flex'; } const i = $('#cq-real'); if (i) i.focus(); return; }
  if (d.cqok !== undefined) return cqMark(0, 'Cuenta cuadrada');
  if (d.cqadj !== undefined) return cqMark(CQ.diff, 'Saldo ajustado y cuenta cuadrada');
  if (d.cqunk !== undefined) {
    S.transactions.push({ id:uid(), type:'gasto', amount:-CQ.diff, date:iso(new Date()), ts:Date.now(), accountId:CQ.id, note:'Sin identificar (cuadre)', src:'cuadre' });
    return cqMark(0, 'Anotado como gasto sin identificar');
  }
  if (d.cqadd) { const id = CQ.id, D = Math.abs(CQ.diff); CQ_RET = ((real) => () => accSheet(id, real))(CQ.real); txForm(null); F.type = d.cqadd; F.amount = D; F.accountId = id; F.catOpen = true; return drawForm(); }
  if (d.cqlist) { const id = d.cqlist; closeSheet(); ui.accFilter = id; ui.view = 'inicio'; render(); return scrollMovs(); }
}, true);
