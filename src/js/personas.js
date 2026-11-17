/* Personas: con quién tienes plata pendiente, en un apartado propio (fuera de Cuentas).
   Una sola fila por persona con su total: todo lo que le debes, la plata suya que tienes y lo que te debe se suma,
   sin importar cuántas veces lo registraste. Se reconoce a la persona por el nombre, sin mayúsculas ni tildes.
   Por dentro cada deuda sigue siendo un movimiento (deudas.js); los pagos por persona se reparten entre sus
   deudas abiertas, de la más vieja a la más nueva. */
const normP = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');
/* el nombre como ya se escribió antes, para que "laura" y "Laura" queden juntos */
function personaCanon(n){
  const k = normP(n); if (!k) return '';
  const t = S.transactions.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)).find(x => x.persona && normP(x.persona) === k);
  return t ? t.persona.trim() : String(n).trim().replace(/\s+/g, ' ');
}
/* cada persona con sus totales abiertos: debes (le debes, incluidas las en pausa), suya (su plata en tus cuentas), teDebe */
function personasLista(){
  const m = new Map();
  for (const it of deudasTodas()) {
    const nom = it.t.persona ? it.t.persona.trim() : '', key = nom ? normP(nom) : '_';
    const x = m.get(key) || { key, nombre:nom || 'Sin nombre', debes:0, suya:0, teDebe:0, items:[], ult:'' };
    if (it.falta) { if (it.k === 'cobrar') x.teDebe += it.falta; else if (it.guardo) x.suya += it.falta; else x.debes += it.falta; }
    x.items.push(it); const d = [it.t.date].concat(it.abonos.map(a => a.date)).sort().pop(); if (d > x.ult) x.ult = d;
    m.set(key, x);
  }
  return [...m.values()].sort((a, b) => (personaAbierta(b) ? 1 : 0) - (personaAbierta(a) ? 1 : 0) || b.ult.localeCompare(a.ult));
}
const personaAbierta = p => p.debes + p.suya + p.teDebe > 0;
function personaResumen(p){
  const l = [p.debes ? 'le debes ' + money(p.debes) : '', p.suya ? 'tienes ' + money(p.suya) + ' suyos' : '', p.teDebe ? 'te debe ' + money(p.teDebe) : ''].filter(Boolean);
  return l.length ? l.join(' · ') : 'a paz y salvo';
}
const iniciales = n => (String(n).trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();
const DEU_KIND = { debes:x => !x.guardo && x.k !== 'cobrar', suya:x => x.guardo, teDebe:x => x.k === 'cobrar' };

/* ----- en Cuentas: solo un resumen y el acceso a Personas ----- */
function personasMini(){
  const l = personasLista().filter(personaAbierta); if (!l.length) return '';
  const s = k => l.reduce((a, p) => a + p[k], 0);
  return '<section class="card"><div class="card-h"><h2>Con otras personas</h2><button class="pill" data-go="personas">Ver personas</button></div>' +
    '<p class="insight">' + [s('suya') ? 'Tienes <b>' + money(s('suya')) + '</b> de otros en tus cuentas' : '', s('debes') ? 'debes <b>' + money(s('debes')) + '</b>' : '', s('teDebe') ? 'te deben <b>' + money(s('teDebe')) + '</b>' : ''].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.</p></section>';
}

/* ----- vista Personas ----- */
function vPersonas(){
  const l = personasLista(), ab = l.filter(personaAbierta), paz = l.filter(p => !personaAbierta(p) && p.key !== '_');
  const s = k => ab.reduce((a, p) => a + p[k], 0);
  let h = '<div class="hello"><h1>Personas</h1><p>Con quién tienes plata pendiente</p></div>' +
    '<section class="card glow"><div class="stats3"><div><span>Le debes</span><b class="num' + (s('debes') ? ' neg' : '') + '">' + money(s('debes')) + '</b></div>' +
    '<div><span>Tienes de otros</span><b class="num' + (s('suya') ? ' warn' : '') + '">' + money(s('suya')) + '</b></div><div><span>Te deben</span><b class="num">' + money(s('teDebe')) + '</b></div></div>' +
    '<p class="note" style="padding:0;margin:10px 0 0">La plata de otros está en tus cuentas, pero no es tuya: no cuenta en tu disponible. Lo que te deben no suma hasta que te paguen.</p></section>';
  const sob = deudaSobrantes();
  if (sob.length) h += '<section class="card"><div class="card-h"><h2>Revisa estos pagos</h2><span class="aside warn">' + money(sob.reduce((s, x) => s + x.v, 0)) + '</span></div>' +
    '<p class="insight">No corresponden a ninguna deuda abierta (la deuda se borró o el pago fue mayor). Ábrelos y corrige el valor o la persona.</p><div>' +
    sob.map(({ x, v }) => '<button class="set deuda" type="button" data-tx="' + esc(x.id) + '"><span class="t"><b>' + esc(x.note || 'Pago') + '</b><span>' + fmtShort(parseISO(x.date)) + ' · sobran ' + money(v) + '</span></span><span class="num">' + money(x.amount) + '</span></button>').join('') + '</div></section>';
  h += '<section class="card"><div class="card-h"><h2>' + (ab.length ? 'Pendientes' : 'Personas') + '</h2><button class="btn sm" data-dnueva>+ Nuevo</button></div>';
  if (ab.length) h += '<div>' + ab.map(personaFila).join('') + '</div>';
  else h += '<p class="insight">No tienes nada pendiente con nadie. Con <b>+ Nuevo</b> registras lo que le debes a alguien, la plata de otra persona que tienes en tu cuenta o lo que prestaste. Si vuelves a usar el mismo nombre, se suma a su total.</p>';
  h += '</section>';
  if (paz.length) h += '<section class="card"><div class="card-h"><h2>A paz y salvo</h2><span class="aside">' + paz.length + '</span></div><div>' + paz.map(personaFila).join('') + '</div></section>';
  return h + '<p class="note">Cada persona aparece una sola vez: si le prestas o le debes otra vez, se suma a su total. Toca una persona para ver su historial, abonar o agregar algo nuevo.</p>';
}
function personaFila(p){
  const neto = p.teDebe - p.debes - p.suya, abierta = personaAbierta(p);
  return '<button class="prow" data-persona="' + esc(p.key) + '"><span class="pav" aria-hidden="true">' + esc(iniciales(p.nombre)) + '</span><span class="t"><b>' + esc(p.nombre) + '</b><span>' + (abierta ? personaResumen(p).replace(/^./, c => c.toUpperCase()) : 'Último movimiento ' + fmtShort(parseISO(p.ult))) + '</span></span>' +
    (abierta ? '<span class="num ' + (neto < 0 ? 'neg' : 'pos') + '">' + (neto < 0 ? '−' : '+') + money(Math.abs(neto)).replace('$ ', '$') + '</span>' : '<span class="pos">✓</span>') + CHEV + '</button>';
}

/* ----- hoja de una persona: totales, acciones e historial ----- */
let PS = null;
function personaSheet(key){
  const p = personasLista().find(x => x.key === key); if (!p) { closeSheet(); return render(); }
  PS = { key };
  const accion = (k, txt) => p[k] ? '<button class="btn accent block" type="button" data-ppagar="' + k + '">' + txt + ' · ' + money(p[k]) + '</button>' : '';
  const ev = [];
  for (const it of p.items) {
    ev.push({ d:it.t.date, ts:it.t.ts || 0, id:it.t.id, v:it.monto, sube:true, txt:it.k === 'cobrar' ? 'Le prestaste' + (it.t.de ? ' plata de ' + it.t.de : '') : it.guardo && it.t.lig ? 'Apartaste para pagarle' + (it.t.toAccountId ? ' en ' + accShort(it.t.toAccountId) : '') : it.guardo ? 'Te dejó su plata' + (it.t.toAccountId ? ' en ' + accShort(it.t.toAccountId) : '') : it.k === 'pausa' ? 'Le quedaste debiendo' : 'Pagó por ti', nota:deudaAuto(it.t) ? '' : deudaConcepto(it.t) });
    for (const a of it.abonos) { if (a.lig) continue; /* el apartado ya sale como una sola línea (la de su plata) */ const ya = ev.find(e => e.tx && e.id === a.id); if (ya) { ya.v += a.amount; continue; } ev.push({ d:a.date, ts:a.ts || 0, id:a.id, tx:true, v:a.amount, sube:false, txt:it.k === 'cobrar' ? 'Te pagó' : it.guardo ? 'Le devolviste' : 'Le pagaste', nota:accShort(it.k === 'cobrar' ? a.toAccountId : a.accountId) }); }
  }
  /* préstamos hechos con su plata: siguen siendo suyos, pero los tiene otra persona */
  for (const it of deudasTodas()) if (it.k === 'cobrar' && it.t.de && normP(it.t.de) === p.key)
    ev.push({ d:it.t.date, ts:it.t.ts || 0, id:it.t.id, v:it.monto, sube:true, txt:'Prestaste de su plata' + (it.t.persona ? ' a ' + it.t.persona : ''), nota:it.falta ? 'faltan ' + money(it.falta) : 'ya te pagaron' });
  const AP = ajenaPersonas().get(p.key);
  /* dónde está su plata: suma exactamente lo que tienes suyo */
  const donde = AP && p.suya ? Object.keys(AP.acc).map(id => esc(accShort(id)) + ' ' + money(AP.acc[id])).concat(AP.fuera ? ['prestados ' + money(AP.fuera)] : [], AP.usado ? ['ya usados ' + money(AP.usado) + ' (debes reponerlos)'] : []) : [];
  ev.sort((a, b) => b.d.localeCompare(a.d) || b.ts - a.ts);
  const h = '<div class="sheet-h"><b id="sheet-title">' + esc(p.nombre) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form pers">' +
    '<section class="card glow" style="padding:16px"><div class="stats3"><div><span>Le debes</span><b class="num' + (p.debes ? ' neg' : '') + '">' + money(p.debes) + '</b></div><div><span>Tienes suyo</span><b class="num' + (p.suya ? ' warn' : '') + '">' + money(p.suya) + '</b></div><div><span>Te debe</span><b class="num">' + money(p.teDebe) + '</b></div></div>' +
    (personaAbierta(p) ? '' : '<p class="note" style="padding:0;margin:10px 0 0">A paz y salvo ✓</p>') +
    (donde.length ? '<p class="note" style="padding:0;margin:10px 0 0">Su plata está así: ' + donde.join(' · ') + '.</p>' : '') + '</section>' +
    accion('debes', 'Pagarle') + (p.debes ? '<button class="btn ghost block" type="button" data-ppagar="apartar">Apartar para pagarle · ' + money(p.debes) + '</button><p class="note" style="padding:0;margin:-6px 0 0">Usa tu plata de una cuenta, pero se queda ahí: pasa a ser suya y baja lo que le debes.</p>' : '') + accion('suya', 'Devolverle su plata') + accion('teDebe', 'Registrar que te pagó') +
    (p.key !== '_' ? '<button class="btn ghost block" type="button" data-buscar="persona:' + esc(p.key) + '">Ver todos sus movimientos</button>' : '') +
    '<div class="field"><span class="label">Agregar con ' + esc(p.nombre) + '</span><div class="chips">' + DN_TIPOS.map(([id, t]) => '<button type="button" class="chip" data-pnueva="' + id + '">+ ' + t.replace(' a alguien', '').replace(' de alguien', ' suya') + '</button>').join('') + '</div><span class="tile-s">Se suma a su total.</span></div>' +
    '<div><span class="label">Historial</span>' + ev.map(x => '<button class="set deuda" type="button" ' + (x.tx ? 'data-tx' : 'data-dver') + '="' + esc(x.id) + '"><span class="t"><b>' + esc(x.txt) + '</b><span>' + fmtShort(parseISO(x.d)) + (x.nota ? ' · ' + esc(x.nota) : '') + '</span></span><span class="num' + (x.sube ? '' : ' pos') + '">' + (x.sube ? '' : '✓ ') + money(x.v) + '</span></button>').join('') + '</div></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* ----- pagar, devolver o cobrar por persona: el valor se reparte entre sus deudas de ese tipo, de la más vieja a la más nueva ----- */
let PP = null;
function personaPagoDraw(){
  const ap = PP.k === 'apartar', K = ap ? 'debes' : PP.k, p = personasLista().find(x => x.key === PP.key), total = p ? p[K] : 0, sale = PP.k !== 'teDebe' && !ap;
  const b = balances(), aj = ajenaPorCuenta(b), opts = cuentasElegibles(b, PP.acc).filter(a => !isCard(a));
  const tit = { debes:'Pagarle a ', suya:'Devolverle a ', teDebe:'Te pagó ', apartar:'Apartar para ' }[PP.k] + p.nombre;
  const h = '<div class="sheet-h"><b id="sheet-title">' + esc(tit) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form ppago">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + { debes:'Le debes en total', suya:'Tienes suyo en total', teDebe:'Te debe en total', apartar:'Le debes en total' }[PP.k] + '</span><div class="tile-v num">' + money(total) + '</div><span class="tile-s">' + (ap ? 'La plata no sale de la cuenta: queda apartada como de ' + esc(p.nombre) + ' hasta que se la entregues. Baja lo que le debes y sube lo que tienes suyo.' : 'Puedes pagar todo o una parte; lo que falte sigue en su total.') + '</span></section>' +
    '<div class="field"><label class="label" for="pp-amt">Valor</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="pp-amt" inputmode="numeric" class="num" value="' + nf.format(PP.v || total) + '" style="font-size:28px"></div></div>' +
    '<div class="field"><span class="label">' + (ap ? 'Se queda en' : sale ? 'Sale de' : 'Llega a') + '</span><div class="cgrid">' + opts.map(a => cuentaTile(a, 'data-ppacc="' + esc(a.id) + '"', PP.acc === a.id, b, aj)).join('') + '</div></div>' +
    '<div class="err" id="pp-err"></div><button class="btn accent block" type="button" data-ppgo>' + (ap ? 'Apartar' : 'Registrar') + '</button></div>';
  $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
/* aplica un pago, devolución, cobro o apartado por persona (lo usan la hoja de la persona y el registro por voz):
   devuelve { err } o { msg, key } y no guarda ni dibuja. k: 'debes' | 'suya' | 'teDebe' | 'apartar' */
function personaPagoAplicar(key, k, v, acc, fecha){
  const ap = k === 'apartar', K = ap ? 'debes' : k, p = personasLista().find(x => x.key === key);
  if (!p) return { err:'No encontré a esa persona.' };
  if (!v) return { err:'Escribe el valor.' }; if (v > p[K]) return { err:'Es más del total (' + money(p[K]) + ').' }; if (!accById(acc)) return { err:'Elige la cuenta.' };
  if (ap) { const b = balances(), propia = (b[acc] || 0) - ((ajenaPorCuenta()[acc] || {}).v || 0);
    if (v > propia) return { err:'En ' + accShort(acc) + ' solo tienes ' + money(Math.max(0, propia)) + ' tuyos (el resto es de otras personas). Elige otra cuenta o un valor menor.' }; }
  /* un solo movimiento por pago (auto '*clase'): Caudal lo reparte por dentro entre sus deudas, de la más vieja a la más nueva.
     Solo si lo que le debes está en dos cuentas de deuda distintas (Por pagar y En pausa) quedan dos movimientos, uno por cada una. */
  let resta = v, n = 0; const ahora = Date.now(), dia = fecha || iso(new Date()), porCuenta = new Map();
  for (const it of p.items.filter(x => x.falta && DEU_KIND[K](x)).sort((a, b) => a.t.date.localeCompare(b.t.date) || (a.t.ts || 0) - (b.t.ts || 0))) {
    if (resta <= 0) break; const parte = Math.min(resta, it.falta), D = deudaAcc(it.k); resta -= parte;
    porCuenta.set(D.id, (porCuenta.get(D.id) || 0) + parte);
  }
  const falta = p[K] - v;
  /* apartar: la plata no sale de tu cuenta. Son dos movimientos enlazados (lig): el pago de la deuda desde tu cuenta y la plata suya que entra a esa misma cuenta.
     Los cálculos de siempre los resuelven solos y en Movimientos se ve una sola línea (el pago queda oculto) */
  if (ap) { const lig = uid(), nota = 'Apartado para ' + p.nombre, P = deudaCrear('pagar');
    for (const [D, monto] of porCuenta) {
      S.transactions.push({ id:uid(), type:'transferencia', amount:monto, date:dia, ts:ahora + n++, accountId:acc, toAccountId:D, note:nota, src:'deuda', auto:'*debes', persona:p.nombre, lig });
      S.transactions.push({ id:uid(), type:'transferencia', amount:monto, date:dia, ts:ahora + n++, accountId:P.id, toAccountId:acc, note:nota, persona:p.nombre, lig }); }
    return { key, msg:'Apartado ' + money(v) + ' para ' + p.nombre + (falta ? ' · le debes ' + money(falta) : ' · saldada') }; }
  for (const [D, monto] of porCuenta) S.transactions.push({ id:uid(), type:'transferencia', amount:monto, date:dia, ts:ahora + n++,
    accountId:k === 'teDebe' ? D : acc, toAccountId:k === 'teDebe' ? acc : D, note:'Pago ' + p.nombre, src:'deuda', auto:'*' + k, persona:p.nombre });
  return { key, msg:falta ? 'Abono registrado · faltan ' + money(falta) : k === 'teDebe' ? p.nombre + ' te pagó todo' : k === 'suya' ? 'Le devolviste todo a ' + p.nombre : 'Le pagaste todo a ' + p.nombre };
}
function personaPagoGuardar(){
  const r = personaPagoAplicar(PP.key, PP.k, leerPesos($('#pp-amt').value), PP.acc); if (r.err) { $('#pp-err').textContent = r.err; return; }
  PP = null; sortTx(S); save(); render(); personaSheet(r.key); toast(r.msg);
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.persona) { e.stopPropagation(); PP = null; return personaSheet(d.persona); }
  if (d.pnueva && PS) { e.stopPropagation(); const p = personasLista().find(x => x.key === PS.key); deudaNuevaSheet(); DN.tipo = d.pnueva; DN.persona = p ? p.nombre : ''; return deudaNuevaDraw(); }
  if (d.ppagar && PS) { e.stopPropagation();
    const pl = planFor(period(0)), pref = (pl && pl.from) || lastAccount(), p = personasLista().find(x => x.key === PS.key);
    /* para devolver su plata, se propone la cuenta donde la tienes */
    const donde = d.ppagar === 'suya' && p ? (p.items.find(x => x.guardo && x.falta) || {}).t : null;
    PP = { key:PS.key, k:d.ppagar, acc:donde ? donde.toAccountId : accById(pref) && !esDeuda(accById(pref)) ? pref : null }; return personaPagoDraw(); }
  if (!PP || !el.closest('.ppago')) return;
  e.stopPropagation();
  if (d.ppacc) { PP.v = leerPesos($('#pp-amt').value); PP.acc = d.ppacc; return personaPagoDraw(); }
  if (d.ppgo !== undefined) return personaPagoGuardar();
}, true);
document.addEventListener('input', e => { if (e.target.id === 'pp-amt') pesosCampo(e.target); });
