/* ---------- Día de pago: el cierre del mes en cuatro pasos ----------
   El mes cierra cuando llega el sueldo. Ese día hay que quedar al día, cuadrar y repartir:
     1. Sueldo: a qué cuenta llegó, pasarlo a la cuenta del plan si llegó a otra (la principal siempre queda
        vacía) y decidir si los gastos del mismo día son del mes que cierra o del nuevo.
     2. Quedar al día: deudas con otras personas y la tarjeta, que se paga por lo que dice el banco
        desde su bolsillo. Si el banco dice otro valor, el cuadre de la tarjeta busca la diferencia.
     3. Cuadrar los bolsillos y el efectivo con capturas, ya con la tarjeta pagada y antes de repartir.
        Las cuentas de paso (GTC2) deben estar vacías.
     4. Repartir: el sobrante (regla de Excedentes; el efectivo se queda y se repone desde la cuenta del plan),
        el sueldo a los bolsillos de ahorro y lo que llegó de más o de menos.
   Cada paso se marca solo cuando los datos lo muestran hecho. Lo que no se puede deducir (gastos del día,
   sueldo distinto) se recuerda en este dispositivo. Al terminar una acción que abre otra hoja, se vuelve aquí. */
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
  /* cada paso junta varias tareas: líneas de texto y botones; queda hecho cuando todas lo están */
  const paso = (titulo, tareas) => P.push({ titulo, ok:tareas.every(x => x.ok), tareas });
  const btn = (attrs, txt, solid) => '<button class="pill' + (solid ? ' solid' : '') + '" ' + attrs + '>' + txt + '</button>';

  /* 1. sueldo */
  if (!sal.length) { paso('Registra el sueldo', [{ ok:false, txt:'Cuando lo registres empieza el mes nuevo.', acc:btn('data-dpsueldo', 'Registrar', true) }]); return { p, pl, P, listo:false, sinSueldo:true }; }
  const t1 = [];
  if (salAcc === pl.from) {
    const otras = S.accounts.filter(a => !a.hidden && !a.apart && !isCard(a) && !esDeuda(a) && !esPaso(a) && a.id !== pl.from && !/ahorro|efectivo/i.test(a.group || ''));
    t1.push({ ok:true, txt:money(sueldo) + ' en ' + accShort(salAcc) + '.', acc:otras.map(a => btn('data-dpsalacc="' + esc(a.id) + '"', 'Llegó a ' + accShort(a.id))).join('') });
  } else {
    const movido = S.transactions.filter(t => t.type === 'transferencia' && !t.pending && t.accountId === salAcc && t.toAccountId === pl.from && inP(t, p)).reduce((a, t) => a + t.amount, 0);
    const falta = Math.max(0, Math.min(sueldo - movido, B[salAcc] || 0));
    t1.push({ ok:!falta, txt:money(sueldo) + ' llegó a ' + accShort(salAcc) + (falta ? '; pásalo a ' + accShort(pl.from) + ', desde donde se reparte.' : ' y ya está en ' + accShort(pl.from) + '.'),
      acc:falta ? btn('data-dpsal="' + falta + '"', 'Mover ' + money(falta) + ' a ' + accShort(pl.from), true) : '' });
  }
  const delDia = S.transactions.filter(t => t.type === 'gasto' && t.date === p.s);
  if (delDia.length) { const ok = lsGet(dpKey(p, 'dia')) === '1';
    t1.push({ ok, txt:ok ? 'Los gastos de hoy quedaron en el mes nuevo.' : 'Gastos de hoy: si los cubriste con el presupuesto del mes que cierra, pásalos a ese mes.',
      acc:ok ? '' : delDia.map(t => btn('data-dpprev="' + esc(t.id) + '"', esc(t.note || catPath(t.categoryId)) + ' ' + money(t.amount) + ' · al mes anterior')).join('') + btn('data-dpdia', 'Son del mes nuevo') }); }
  paso('Sueldo', t1);

  /* 2. quedar al día: deudas y tarjeta (por lo que dice el banco, desde su bolsillo) */
  const t2 = [], ab = deudasAbiertas();
  t2.push(ab.length ? { ok:false, txt:'Deudas abiertas: págalas o cóbralas para que el sobrante sea real.', acc:deudaFilas(ab) } : { ok:true, txt:'Sin deudas con otras personas.' });
  for (const c of S.accounts.filter(a => a.card && !a.hidden)) {
    const debe = Math.max(0, -(B[c.id] || 0));
    t2.push({ ok:!debe, txt:debe ? accShort(c.id) + ': Caudal dice que debes ' + money(debe) + '. Sale de ' + accShort(c.card.pocket) + ', con la plata del mes que cierra.' : accShort(c.id) + ' pagada.',
      acc:debe ? btn('data-dppay="' + esc(c.id) + '"', 'Pagar ' + money(debe), true) + btn('data-dpcq="' + esc(c.id) + '"', 'El banco dice otro valor') : '' });
  }
  paso('Quedar al día', t2);

  /* 3. cuadrar bolsillos y efectivo, con la tarjeta ya pagada y antes de repartir */
  const ids = [pl.from, ...S.accounts.filter(a => !a.hidden && !a.apart && esEfectivo(a.id) && (B[a.id] || 0) !== 0).map(a => a.id)];
  const sinCq = ids.filter(id => !cuadradaDesde(id, p)), llenas = S.accounts.filter(a => !a.hidden && esPaso(a) && (B[a.id] || 0) !== 0);
  const t3 = [{ ok:!sinCq.length, txt:sinCq.length ? 'Sube la captura de tus bolsillos en Lulo y cuenta el efectivo.' : ids.map(accShort).join(', ') + ' coinciden con el banco.',
    acc:sinCq.length ? (aiOn() ? btn('data-foto', 'Subir captura', true) : '') + sinCq.filter(id => !aiOn() || esEfectivo(id)).map(id => btn('data-dpcq="' + esc(id) + '"', accShort(id) + ' ' + money(B[id] || 0))).join('') : '' }];
  for (const a of llenas) t3.push({ ok:false, txt:accShort(a.id) + ' tiene ' + money(B[a.id]) + ': es cuenta de paso y debe quedar vacía.', acc:btn('data-dpcq="' + esc(a.id) + '"', 'Cuadrar ' + accShort(a.id)) });
  paso('Cuadrar', t3);

  /* 4. repartir: sobrante, sueldo a los bolsillos y lo que llegó distinto */
  const t4 = [], hecho = S.transactions.some(t => t.src === 'sobrante' && inP(t, p)), si = hecho ? null : sobranteInfo();
  if (hecho || !si || (si.left < 1000 && !si.exceso)) t4.push({ ok:true, txt:hecho ? 'Sobrante repartido.' : 'No sobró nada del mes.' });
  else t4.push({ ok:false, txt:'Sobrante: ' + money(si.left) + ' (' + sobFuentes(si) + ')' + (si.exceso ? ', y Excedentes tiene ' + money(si.exceso) + ' por encima del techo' : '') + '.', acc:btn('data-sobra', 'Repartir el sobrante', true) });
  const pend = planDests(pl, p).filter(d => d.done < d.amount), tot = pend.reduce((a, d) => a + d.amount - d.done, 0);
  t4.push(pend.length ? { ok:false, txt:'Ahorros del mes: ' + pend.map(d => accShort(d.acc) + ' ' + money(d.amount - d.done)).join(' · ') + '.', acc:btn('data-dpreparto', 'Mover ' + money(tot), true) } : { ok:true, txt:'Cada bolsillo recibió lo de su plan.' });
  const dif = sueldo - pl.income;
  if (dif) {
    const ah = (excRule() || {}).ahorro || pl.surplus, ok = S.transactions.some(t => t.note === 'Extra del sueldo' && inP(t, p)) || lsGet(dpKey(p, 'extra')) === '1';
    t4.push({ ok, txt:ok ? 'Diferencia del sueldo resuelta.' : dif > 0 ? 'El sueldo trajo ' + money(dif) + ' de más que el plan.' : 'El sueldo llegó ' + money(-dif) + ' por debajo del plan: a ' + accShort(pl.from) + ' le queda menos para el mes.',
      acc:ok ? '' : (dif > 0 && ah ? btn('data-dpextra="' + esc(ah) + '"', 'A ' + accShort(ah), true) : '') + btn('data-dpincome', 'Mi sueldo ahora es ' + money(sueldo)) + btn('data-dpok', dif > 0 ? 'Dejar en ' + accShort(pl.from) : 'Entendido') });
  }
  paso('Repartir', t4);
  return { p, pl, P, listo:P.every(x => x.ok) };
}

function diaPagoOpen(){
  const D = diaPagoPasos(); if (!D) return toast('Arma primero tu plan del mes');
  const n = D.P.filter(x => x.ok).length;
  let h = '<div class="sheet-h"><b id="sheet-title">Día de pago</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form dp">' +
    '<p class="insight" style="margin:0">' + (D.sinSueldo ? 'El mes cierra cuando llega el sueldo.' : D.listo ? '<b class="pos">Mes cerrado ✓</b> Quedaste al día y todo está repartido.' : n + ' de ' + D.P.length + ' pasos. Hazlos en orden, igual que en Lulo.') + '</p><div>';
  D.P.forEach((x, i) => {
    h += '<div class="prep' + (x.ok ? ' ok' : '') + '" style="flex-wrap:wrap"><div class="rmain"><b>' + (i + 1) + '. ' + esc(x.titulo) + '</b>' +
      x.tareas.map(t => '<span>' + (x.ok ? '' : t.ok ? '✓ ' : '· ') + esc(t.txt) + '</span>' + (!t.ok && t.acc ? '<div class="pills" style="margin:6px 0 4px">' + t.acc + '</div>' : '')).join('') + '</div>' +
      (x.ok ? '<span class="pchk" aria-label="Hecho">✓</span>' : '') + '</div>';
  });
  /* comprobación final opcional: otra captura con todo repartido */
  if (D.listo && aiOn()) h += '<button class="btn ghost block" data-foto>Comprobar con una captura</button>';
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
  if (enLista && (d.dpay || d.sobra !== undefined || d.foto !== undefined)) { DPV = true; return; } /* sus manejadores abren la hoja; al terminar vuelve aquí */
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
