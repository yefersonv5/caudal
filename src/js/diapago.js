/* ---------- Día de pago: el cierre del mes paso a paso ----------
   El mes cierra cuando llega el sueldo. Ese día hay que quedar al día y repartir:
     1. Registrar el sueldo y decir a qué cuenta llegó (puede ser la principal y no la del plan).
     2. Decidir si los gastos del mismo día son del mes que cierra o del nuevo.
     3. Saldar las deudas con otras personas.
     4. Cuadrar la tarjeta con el banco y pagarla desde su bolsillo, con la plata del mes que cierra.
     5. Cuadrar la cuenta del plan y el efectivo con lo que dice el banco.
     6. Pasar el sueldo a la cuenta del plan, si llegó a otra.
     7. Repartir el sobrante (regla de Excedentes; el efectivo se queda y se repone desde la cuenta del plan).
     8. Repartir el sueldo a los bolsillos de ahorro.
     9. Decidir qué hacer si el sueldo llegó distinto a lo planeado.
   Cada paso se marca solo cuando los datos lo muestran hecho. Lo que no se puede deducir (pasos 2 y 9)
   se recuerda en este dispositivo. Al terminar una acción que abre otra hoja, se vuelve a esta lista. */
let DPV = false;
const dpVolver = () => { if (!DPV) return; DPV = false; setTimeout(diaPagoOpen, 320); };
const dpKey = (p, k) => 'dp.' + k + '.' + p.s;
const sueldosDe = p => { const sc = salaryCat(); return sc ? S.transactions.filter(t => t.type === 'ingreso' && t.categoryId === sc.id && !t.pending && inP(t, p)) : []; };
const cuadradaDesde = (id, p) => { const l = lastCuadre(id); return !!l && l.date >= p.s; };
/* cuenta donde suele llegar el sueldo: la del último sueldo registrado */
function cuentaSueldo(){
  const sc = salaryCat(); let l = null;
  if (sc) for (const t of S.transactions) if (t.type === 'ingreso' && t.categoryId === sc.id && (!l || t.date > l.date)) l = t;
  return l ? l.accountId : null;
}

function diaPagoPasos(){
  const p = period(0), pl = planFor(p); if (!pl || !pl.from) return null;
  const B = balances(), P = [], sal = sueldosDe(p), sueldo = sal.reduce((a, t) => a + t.amount, 0);
  const salAcc = sal.length ? sal[0].accountId : null;
  const paso = (titulo, ok, detalle, acciones) => P.push({ titulo, ok, detalle, acciones:acciones || '' });
  const btn = (attrs, txt, solid) => '<button class="pill' + (solid ? ' solid' : '') + '" ' + attrs + '>' + txt + '</button>';

  /* 1. sueldo */
  if (!sal.length) { paso('Registra el sueldo', false, 'Cuando lo registres empieza el mes nuevo.', btn('data-dpsueldo', 'Registrar', true)); return { p, pl, P, listo:false, sinSueldo:true }; }
  const bancos = S.accounts.filter(a => !a.hidden && !a.apart && !isCard(a) && !esDeuda(a) && !/ahorro|efectivo/i.test(a.group || ''));
  paso('Sueldo', true, money(sueldo) + ' en ' + accShort(salAcc) + '. ¿Llegó a otra cuenta?',
    bancos.filter(a => a.id !== salAcc).map(a => btn('data-dpsalacc="' + esc(a.id) + '"', accShort(a.id))).join(''));

  /* 2. gastos del mismo día */
  const delDia = S.transactions.filter(t => t.type === 'gasto' && t.date === p.s);
  const dOk = !delDia.length || lsGet(dpKey(p, 'dia')) === '1';
  paso('Gastos del día de pago', dOk, delDia.length ? (dOk ? 'Quedaron en el mes nuevo.' : 'Si los cubriste con el presupuesto del mes que cierra, pásalos a ese mes.') : 'No hay gastos ese día.',
    dOk ? '' : delDia.map(t => btn('data-dpprev="' + esc(t.id) + '"', esc(t.note || catPath(t.categoryId)) + ' ' + money(t.amount) + ' · al mes anterior')).join('') + btn('data-dpdia', 'Son del mes nuevo'));

  /* 3. deudas */
  const ab = deudasAbiertas();
  paso('Deudas', !ab.length, ab.length ? 'Págalas o cóbralas para que el sobrante sea real.' : 'Sin deudas abiertas.', ab.length ? deudaFilas(ab) : '');

  /* 4. tarjetas: cuadrar con el banco y pagar desde su bolsillo */
  for (const c of S.accounts.filter(a => a.card && !a.hidden)) {
    const debe = Math.max(0, -(B[c.id] || 0)), cq = cuadradaDesde(c.id, p);
    paso('Tarjeta ' + accShort(c.id), cq && !debe, !cq ? 'Primero compara la deuda con la del banco.' : debe ? 'Debes ' + money(debe) + '. Se paga desde ' + accShort(c.card.pocket) + ', con la plata del mes que cierra.' : 'Cuadrada y al día.',
      !cq ? btn('data-dpcq="' + esc(c.id) + '"', 'Cuadrar', true) : debe ? btn('data-dppay="' + esc(c.id) + '"', 'Pagar ' + money(debe), true) : '');
  }

  /* 5. cuadrar la cuenta del plan, la del sueldo y el efectivo */
  /* las cuentas en cero no hace falta cuadrarlas (la del sueldo después de pasarlo, una caja vacía) */
  const ids = [...new Set([pl.from, salAcc, ...S.accounts.filter(a => !a.hidden && !a.apart && esEfectivo(a.id)).map(a => a.id)])].filter(id => id && (id === pl.from || (B[id] || 0) !== 0));
  const sinCq = ids.filter(id => !cuadradaDesde(id, p));
  paso('Cuadrar con el banco', !sinCq.length, sinCq.length ? 'Compara el saldo de cada una con el banco o con lo que tienes en la billetera.' : ids.map(accShort).join(', ') + ' cuadradas.',
    sinCq.map(id => btn('data-dpcq="' + esc(id) + '"', accShort(id) + ' ' + money(B[id] || 0))).join(''));

  /* 6. sueldo a la cuenta del plan */
  if (salAcc !== pl.from) {
    const movido = S.transactions.filter(t => t.type === 'transferencia' && !t.pending && t.accountId === salAcc && t.toAccountId === pl.from && inP(t, p)).reduce((a, t) => a + t.amount, 0);
    const falta = Math.max(0, Math.min(sueldo - movido, B[salAcc] || 0));
    paso('Pasar el sueldo a ' + accShort(pl.from), falta <= 0, falta > 0 ? 'Llegó a ' + accShort(salAcc) + '; el plan se reparte desde ' + accShort(pl.from) + '.' : 'Ya está en ' + accShort(pl.from) + '.',
      falta > 0 ? btn('data-dpsal="' + falta + '"', 'Mover ' + money(falta), true) : '');
  }

  /* 7. sobrante del mes que cierra */
  const hecho = S.transactions.some(t => t.src === 'sobrante' && inP(t, p)), si = hecho ? null : sobranteInfo();
  const nada = si && si.left < 1000 && !si.exceso;
  paso('Repartir el sobrante', hecho || nada || !si, hecho ? 'Repartido.' : nada || !si ? 'No sobró nada.' :
    'Sobran ' + money(si.left) + ' (' + sobFuentes(si) + ')' + (si.exceso ? ', y Excedentes tiene ' + money(si.exceso) + ' por encima del techo' : '') + '.',
    hecho || nada || !si ? '' : btn('data-sobra', 'Repartir', true));

  /* 8. reparto del sueldo a los bolsillos */
  const pend = planDests(pl, p).filter(d => d.done < d.amount), tot = pend.reduce((a, d) => a + d.amount - d.done, 0);
  paso('Repartir el sueldo', !pend.length, pend.length ? pend.map(d => accShort(d.acc) + ' ' + money(d.amount - d.done)).join(' · ') : 'Cada bolsillo recibió lo de su plan.',
    pend.length ? btn('data-dpreparto', 'Mover ' + money(tot), true) : '');

  /* 9. sueldo distinto a lo planeado */
  const dif = sueldo - pl.income;
  if (dif) {
    const ah = (excRule() || {}).ahorro || pl.surplus, yaMovido = S.transactions.some(t => t.note === 'Extra del sueldo' && inP(t, p));
    const ok = yaMovido || lsGet(dpKey(p, 'extra')) === '1';
    paso(dif > 0 ? 'El sueldo trajo ' + money(dif) + ' de más' : 'El sueldo llegó ' + money(-dif) + ' por debajo del plan', ok,
      ok ? 'Resuelto.' : dif > 0 ? 'Si no haces nada, queda en ' + accShort(pl.from) + ' y sale como sobrante al próximo cierre.' : 'El reparto sale completo, así que a ' + accShort(pl.from) + ' le queda menos para el mes.',
      ok ? '' : (dif > 0 && ah ? btn('data-dpextra="' + esc(ah) + '"', 'A ' + accShort(ah), true) : '') + btn('data-dpincome', 'Mi sueldo ahora es ' + money(sueldo)) + btn('data-dpok', dif > 0 ? 'Dejar en ' + accShort(pl.from) : 'Entendido'));
  }
  return { p, pl, P, listo:P.every(x => x.ok) };
}

function diaPagoOpen(){
  const D = diaPagoPasos(); if (!D) return toast('Arma primero tu plan del mes');
  const n = D.P.filter(x => x.ok).length;
  let h = '<div class="sheet-h"><b id="sheet-title">Día de pago</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form dp">' +
    '<p class="insight" style="margin:0">' + (D.sinSueldo ? 'El mes cierra cuando llega el sueldo.' : D.listo ? '<b class="pos">Mes cerrado ✓</b> Quedaste al día y todo está repartido.' : n + ' de ' + D.P.length + ' pasos. Hazlos en orden y en Lulo al mismo tiempo.') + '</p><div>';
  D.P.forEach((x, i) => {
    h += '<div class="prep' + (x.ok ? ' ok' : '') + '" style="flex-wrap:wrap"><div class="rmain"><b>' + (i + 1) + '. ' + esc(x.titulo) + '</b><span>' + esc(x.detalle) + '</span></div>' +
      (x.ok ? '<span class="pchk" aria-label="Hecho">✓</span>' : '') +
      (x.acciones ? '<div class="pills" style="width:100%">' + x.acciones + '</div>' : '') + '</div>';
  });
  h += '</div></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* Inicio: aviso del día de pago (o de registrar el sueldo cuando ya debería haber llegado) */
function diaPagoBanner(){
  const p = period(0), pl = planFor(p); if (!pl || !pl.from || S.demo) return '';
  const d = todayIdx(p), hoy = new Date().getDate();
  if (d >= 24 && hoy >= 25 && !lsGet('dp.luego.' + iso(new Date())))
    return '<div class="banner"><span><b>¿Ya te pagaron?</b> Registra el sueldo y Caudal te lleva paso a paso por el cierre del mes.</span><span style="display:flex;gap:6px"><button class="btn sm ghost" data-dpluego>Aún no</button><button class="btn sm" data-dpsueldo>Registrar</button></span></div>';
  if (d > 7) return '';
  const D = diaPagoPasos(); if (!D || D.listo) return '';
  const n = D.P.filter(x => !x.ok).length;
  return '<div class="banner"><span><b>Día de pago.</b> ' + (n === 1 ? 'Falta un paso' : 'Faltan ' + n + ' pasos') + ' para cerrar el mes y repartir el sueldo.</span><button class="btn sm" data-dpopen>Continuar</button></div>';
}

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.dpopen !== undefined) { e.stopPropagation(); return diaPagoOpen(); }
  if (d.dpluego !== undefined) { e.stopPropagation(); lsSet('dp.luego.' + iso(new Date()), '1'); return render(); }
  if (d.dpsueldo !== undefined) { e.stopPropagation(); const sc = salaryCat(), acc = cuentaSueldo();
    txForm(null, 'ingreso'); if (sc) { F.parent = sc.id; F.sub = null; F.catOpen = false; } if (acc) F.accountId = acc;
    CQ_RET = () => diaPagoOpen(); return drawForm(); }
  /* desde aquí, solo botones de la lista o de las hojas que abre */
  const enLista = el.closest('.dp');
  if (enLista && (d.dpay || d.sobra !== undefined)) { DPV = true; return; } /* sus manejadores abren la hoja; al terminar vuelve aquí */
  if (!enLista) return;
  const p = period(0), pl = planFor(p); if (!pl) return; e.stopPropagation();
  if (d.dpsalacc) { for (const t of sueldosDe(p)) t.accountId = d.dpsalacc; save(); render(); return diaPagoOpen(); }
  if (d.dpprev) { const t = S.transactions.find(x => x.id === d.dpprev); if (t) { t.date = iso(dayBefore(p.start)); sortTx(S); save(); render(); toast('Pasó al mes anterior'); } return diaPagoOpen(); }
  if (d.dpdia !== undefined) { lsSet(dpKey(p, 'dia'), '1'); return diaPagoOpen(); }
  if (d.dpcq) { DPV = true; return accSheet(d.dpcq); }
  if (d.dppay) { const c = accById(d.dppay), debe = Math.max(0, -(balances()[c.id] || 0)); if (!debe) return diaPagoOpen();
    S.transactions.push({ id:uid(), type:'transferencia', amount:debe, date:iso(new Date()), ts:Date.now(), accountId:c.card.pocket, toAccountId:c.id, note:'Pago tarjeta', src:'diapago' });
    sortTx(S); save(); render(); toast('Pago registrado: hazlo igual en el banco'); return diaPagoOpen(); }
  if (d.dpsal) { const sal = sueldosDe(p)[0]; if (sal) { S.transactions.push({ id:uid(), type:'transferencia', amount:+d.dpsal, date:iso(new Date()), ts:Date.now(), accountId:sal.accountId, toAccountId:pl.from, note:'Sueldo a ' + accShort(pl.from), src:'diapago' }); sortTx(S); save(); render(); }
    return diaPagoOpen(); }
  if (d.dpreparto !== undefined) { const n = planRepartir(pl, p); save(); render(); toast(n === 1 ? 'Movido' : n + ' transferencias registradas'); return diaPagoOpen(); }
  if (d.dpextra) { const dif = sueldosDe(p).reduce((a, t) => a + t.amount, 0) - pl.income;
    if (dif > 0) { S.transactions.push({ id:uid(), type:'transferencia', amount:dif, date:iso(new Date()), ts:Date.now(), accountId:pl.from, toAccountId:d.dpextra, note:'Extra del sueldo', src:'diapago' }); sortTx(S); save(); render(); }
    return diaPagoOpen(); }
  if (d.dpincome !== undefined) { pl.income = sueldosDe(p).reduce((a, t) => a + t.amount, 0); save(); render(); toast('Plan actualizado'); return diaPagoOpen(); }
  if (d.dpok !== undefined) { lsSet(dpKey(p, 'extra'), '1'); return diaPagoOpen(); }
}, true);
