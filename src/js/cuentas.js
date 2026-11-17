/* Cuentas: una sola lista, en el orden que la persona elige (sin grupos), con el reparto del disponible.
   Una cuenta puede tener subcuentas (bolsillos: ej. "Ahorro" y "Gasto" dentro de "Ualá"): la subcuenta guarda
   parentAcc con el id de su cuenta. La cuenta muestra su total (lo suyo más sus subcuentas) y debajo cada bolsillo.
   Cada fila separa lo que es tuyo de la plata de otras personas que guardas ahí (Personas › Tengo plata suya).
   Tocar la cuenta abre sus movimientos y el cuadre; el botón Editar abre su nombre, tipo y orden. */
const ordenCuenta = (x, y) => (x.order || 0) - (y.order || 0);
const subsDe = id => S.accounts.filter(a => a.parentAcc === id && !a.hidden && !esDeuda(a)).sort(ordenCuenta);
const madreDe = a => (a && a.parentAcc && accById(a.parentAcc)) || null;
/* principales en su orden y, justo después de cada una, sus subcuentas */
const cuentasOrden = () => { const vis = S.accounts.filter(a => !a.hidden && !esDeuda(a));
  return vis.filter(a => !a.parentAcc || !vis.some(m => m.id === a.parentAcc)).sort(ordenCuenta).flatMap(m => [m, ...subsDe(m.id)]); };
const cuentaTipo = a => isCard(a) ? 'Tarjeta de crédito' : a.apart ? 'Apartada' : '';
/* lo tuyo y lo de otros dentro de una cuenta (con sus subcuentas) */
function tuyoYAjeno(b, aj, a, conSubs){
  const ids = [a.id].concat(conSubs ? subsDe(a.id).map(x => x.id) : []);
  const tot = ids.reduce((s, id) => s + (b[id] || 0), 0), ajeno = ids.reduce((s, id) => s + ((aj[id] || {}).v || 0), 0);
  const quien = [...new Set(ids.flatMap(id => (aj[id] || {}).quien || []))];
  return { tot, ajeno, tuyo:tot - ajeno, quien };
}
const ajenoTxt = x => x.ajeno ? 'Tuyo ' + money(x.tuyo) + ' · ' + money(x.ajeno) + ' de ' + (x.quien.length ? esc(x.quien.slice(0, 2).join(' y ')) + (x.quien.length > 2 ? ' y otros' : '') : 'otros') : '';
/* de dónde sale el total de plata de otros (el mismo de Personas): en tus cuentas, prestada y ya usada */
function ajenaDesglose(AT, enVis){
  if (!AT.suya || (!AT.fuera && !AT.usado && AT.cuentas === enVis)) return '';
  const l = [money(enVis) + ' en tus cuentas', AT.cuentas > enVis ? money(AT.cuentas - enVis) + ' en cuentas ocultas' : '', AT.fuera ? money(AT.fuera) + ' prestados a otros' : '', AT.usado ? money(AT.usado) + ' que ya usaste y debes reponer' : ''].filter(Boolean);
  return '<p class="note" style="padding:0;margin:-6px 0 10px">De otras personas: ' + l.join(' · ') + '.</p>';
}
/* botón de cuenta para los selectores: nombre, saldo y, si hay plata de otros, cuánto es tuyo */
function cuentaTile(a, attrs, pressed, b, aj){
  const x = tuyoYAjeno(b, aj, a, false);
  return '<button type="button" class="ctile sm acct" ' + attrs + ' aria-pressed="' + pressed + '"><span class="nm">' + esc(accShort(a.id)) + '</span>' +
    '<span class="bal num' + (x.tot < 0 ? ' neg' : '') + '">' + money(x.tot) + '</span>' + (x.ajeno ? '<span class="bal2 num">tuyo ' + money(x.tuyo) + '</span>' : '') + '</button>';
}
/* cuentas para elegir: las de cada principal juntas; una principal con bolsillos sale solo si tiene plata propia */
function cuentasElegibles(b, incluir){
  return cuentasOrden().filter(a => a.id === incluir || !(subsDe(a.id).length && !(b[a.id] || 0)));
}
function vCuentas(){
  const b = balances(), aj = ajenaPorCuenta(b), vis = cuentasOrden(), tops = vis.filter(a => !madreDe(a) || madreDe(a).hidden);
  const pos = vis.filter(a => (b[a.id] || 0) > 0).sort((x, y) => b[y.id] - b[x.id]), posTotal = pos.reduce((x, a) => x + b[a.id], 0) || 1;
  const col = a => serieColor(pos.indexOf(a));
  const enCuentas = vis.reduce((x, a) => x + (b[a.id] || 0), 0), deOtros = vis.reduce((x, a) => x + ((aj[a.id] || {}).v || 0), 0), AT = ajenaTotales();
  let out = '<div class="hello"><h1>Cuentas</h1><p>' + tops.length + (tops.length === 1 ? ' cuenta activa' : ' cuentas activas') + '</p></div>';
  const aparts = vis.filter(a => a.apart), apartSum = aparts.reduce((x, a) => x + (b[a.id] || 0), 0), disp = dispTotal(b);
  out += '<section class="card glow"><span class="label">Disponible tuyo</span><div class="big num">' + (disp < 0 ? '<small>−</small>' : '') + '<small>$</small>' + nf.format(Math.abs(disp)) + '</div>' +
    '<div class="stats3" style="margin:2px 0 12px"><div><span>En tus cuentas</span><b class="num">' + money(enCuentas) + '</b></div><div><span>Es tuyo</span><b class="num">' + money(enCuentas - deOtros) + '</b></div><div><span>De otras personas</span><b class="num' + (AT.suya ? ' warn' : '') + '">' + money(AT.suya) + '</b></div></div>' + ajenaDesglose(AT, deOtros) +
    '<p class="note" style="padding:0;margin:-4px 0 10px">' + (aparts.length ? 'Apartado ' + money(apartSum) + ' (' + esc(aparts.map(a => accShort(a.id)).join(', ')) + '), no cuenta en tu disponible. ' : '') + (AT.suya ? 'La plata de otras personas no es tuya: no cuenta en tu disponible. ' : '') + (S.accounts.some(a => isCard(a)) ? 'Ya descuenta lo que debes en tarjetas.' : '') + '</p>' +
    '<div class="dist" aria-hidden="true">' + pos.map(a => '<i style="width:' + (b[a.id] / posTotal * 100).toFixed(1) + '%;background:' + col(a) + '"></i>').join('') + '</div>' +
    '<div class="distlg">' + pos.map(a => '<div><i style="background:' + col(a) + '"></i><span>' + esc(accShort(a.id)) + '</span><b class="num">' + Math.round(b[a.id] / posTotal * 100) + '% · ' + money(b[a.id]) + '</b></div>').join('') + '</div></section>';
  const fila = (a, sub) => { const t = cuentaTipo(a), x = tuyoYAjeno(b, aj, a, !sub), at = ajenoTxt(x), subs = sub ? [] : subsDe(a.id);
    const info = [t, at, subs.length ? plural(subs.length, 'subcuenta', 'subcuentas') : cuadreTxt(a.id)].filter(Boolean).join(' · ');
    return '<div class="accrow' + (sub ? ' sub' : '') + '"><button class="acc" data-accsheet="' + esc(a.id) + '"><span class="nm">' + esc(a.name) + '<small>' + info + '</small></span><span class="am num ' + (x.tot < 0 ? 'neg' : '') + '">' + money(x.tot) + '</span></button>' +
      '<button class="pill" data-accedit="' + esc(a.id) + '" aria-label="Editar ' + esc(a.name) + '">Editar</button></div>' +
      (subs.length ? subs.map(s => fila(s, true)).join('') + ((b[a.id] || 0) ? '<div class="accrow sub"><div class="acc"><span class="nm">Sin subcuenta<small>Plata de ' + esc(a.name) + ' que no está en ningún bolsillo</small></span><span class="am num">' + money(b[a.id]) + '</span></div></div>' : '') : ''); };
  out += '<section class="card"><div class="card-h"><h2>Tus cuentas</h2><button class="pill" data-newacc>+ Nueva</button></div><div>' +
    (tops.length ? tops.map(a => fila(a, false)).join('') : '<p class="insight">Aún no tienes cuentas. Agrega dónde guardas tu plata: efectivo, Nequi, tu banco…</p>') + '</div></section>';
  out += cardSummary() + personasMini();
  if (aiOn()) out += '<button class="btn block ghost" data-foto>Cuadrar con captura</button>';
  out += '<p class="note">Toca una cuenta para ver sus movimientos o cuadrarla con el saldo real del banco. Con Editar le cambias el nombre, el tipo, el orden o le creas subcuentas, como un bolsillo de ahorro y otro de gastos.</p>';
  return out;
}
