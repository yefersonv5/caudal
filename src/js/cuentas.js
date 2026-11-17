/* Cuentas: el disponible (sumando las cuentas que tú marques), tus cuentas separadas en Efectivo y Cuentas,
   cada cuenta con sus bolsillos agrupados debajo, y aparte las tarjetas de crédito y las deudas.
   Un bolsillo es una cuenta con parentAcc = id de su cuenta (un solo nivel, nunca una tarjeta).
   Tocar una cuenta abre sus movimientos y el cuadre; el botón Editar abre su nombre, tipo y orden. */
const ordenCuenta = (x, y) => (x.order || 0) - (y.order || 0);
const subsDe = id => S.accounts.filter(a => a.parentAcc === id && !a.hidden && !esDeuda(a)).sort(ordenCuenta);
const madreDe = a => (a && a.parentAcc && accById(a.parentAcc)) || null;
/* principales en su orden y, justo después de cada una, sus bolsillos (también la usan los selectores, con tarjetas) */
const cuentasOrden = () => { const vis = S.accounts.filter(a => !a.hidden && !esDeuda(a));
  return vis.filter(a => !a.parentAcc || !vis.some(m => m.id === a.parentAcc)).sort(ordenCuenta).flatMap(m => [m, ...subsDe(m.id)]); };
const esEfectivoAcc = a => /efectivo/i.test((a && a.group) || '');
/* bolsillos por nombre: "(GTC) Lulo Bank" es el bolsillo GTC de Lulo Bank. Las cuentas que comparten banco se
   muestran juntas bajo ese banco, solo en pantalla: no se cambia ni se renombra ninguna cuenta. */
const bolsilloNombre = a => { const m = /^\(([^)]+)\)\s*(.+)$/.exec((a && a.name) || ''); return m ? { bolsillo:m[1].trim(), banco:m[2].trim() } : null; };
/* la lista en orden, con las cuentas del mismo banco (dos o más) reunidas en un solo grupo donde aparece la primera */
function agruparPorBanco(l){
  const cuenta = {}; for (const a of l) { const n = bolsilloNombre(a); if (n) cuenta[n.banco.toLowerCase()] = (cuenta[n.banco.toLowerCase()] || 0) + 1; }
  const out = [], grupos = {};
  for (const a of l) { const n = bolsilloNombre(a), k = n && n.banco.toLowerCase();
    if (!k || cuenta[k] < 2) { out.push({ acc:a }); continue; }
    if (!grupos[k]) out.push(grupos[k] = { banco:n.banco, list:[] });
    grupos[k].list.push(a); }
  return out;
}
const nombreBolsillo = a => { const n = bolsilloNombre(a); return n ? n.bolsillo : a.name; };
/* botón de cuenta para los selectores: nombre y saldo de hoy */
function cuentaTile(a, attrs, pressed, b){
  const v = b[a.id] || 0;
  return '<button type="button" class="ctile sm acct" ' + attrs + ' aria-pressed="' + pressed + '"><span class="nm">' + esc(accShort(a.id)) + '</span>' +
    '<span class="bal num' + (v < 0 ? ' neg' : '') + '">' + money(v) + '</span></button>';
}
/* cuentas para elegir: las de cada principal juntas; una principal con bolsillos sale solo si tiene plata propia */
function cuentasElegibles(b, incluir){
  return cuentasOrden().filter(a => a.id === incluir || !(subsDe(a.id).length && !(b[a.id] || 0)));
}

/* ----- disponible: qué cuentas suman -----
   Por defecto, igual que dispTotal: todas las visibles menos las apartadas (las tarjetas y Por pagar restan).
   Marcar o desmarcar es para jugar con el total: se guarda solo en este celular y no cambia ninguna cuenta. */
const DSEL = 'caudal.dispSel';
const dispSel = () => { try { return JSON.parse(localStorage.getItem(DSEL) || '{}') || {}; } catch (_) { return {}; } };
const dispCuenta = (a, sel) => a.id in sel ? !!sel[a.id] : !a.apart;
function dispMarcar(id){
  const a = accById(id); if (!a) return; const sel = dispSel(), v = !dispCuenta(a, sel);
  if (v === !a.apart) delete sel[id]; else sel[id] = v; /* solo se guarda lo que difiere de lo normal */
  try { localStorage.setItem(DSEL, JSON.stringify(sel)); } catch (_) {}
  render();
}
function dispCard(b){
  const sel = dispSel(), todas = S.accounts.filter(a => !a.hidden);
  const marcadas = todas.filter(a => dispCuenta(a, sel)), total = marcadas.reduce((x, a) => x + (b[a.id] || 0), 0);
  const patrimonio = todas.reduce((x, a) => x + (b[a.id] || 0), 0), cambiado = todas.some(a => a.id in sel);
  const pos = marcadas.filter(a => (b[a.id] || 0) > 0).sort((x, y) => b[y.id] - b[x.id]), posTotal = pos.reduce((x, a) => x + b[a.id], 0) || 1;
  const col = a => serieColor(pos.indexOf(a));
  const chip = a => { const on = dispCuenta(a, sel), v = b[a.id] || 0;
    return '<button type="button" class="dsel' + (madreDe(a) ? ' sub' : '') + '" data-dsel="' + esc(a.id) + '" aria-pressed="' + on + '"><span class="ck" aria-hidden="true">' + (on ? '✓' : '') + '</span>' +
      '<span class="nm">' + esc(madreDe(a) ? a.name : accShort(a.id)) + '</span><b class="num' + (v < 0 ? ' neg' : '') + '">' + money(v) + '</b></button>'; };
  const chipBol = a => chip(a).replace('class="dsel', 'class="dsel sub').replace('>' + esc(accShort(a.id)) + '<', '>' + esc(nombreBolsillo(a)) + '<');
  const grupo = (tit, l, porBanco) => l.length ? '<div class="dsel-g"><span class="dsel-t">' + tit + '</span>' +
    (porBanco ? agruparPorBanco(l.filter(a => !madreDe(a))).map(x => x.acc ? chip(x.acc) + subsDe(x.acc.id).map(chip).join('') : '<span class="dsel-banco">' + esc(x.banco) + '</span>' + x.list.map(chipBol).join('')).join('') : l.map(chip).join('')) + '</div>' : '';
  const orden = cuentasOrden().filter(a => !isCard(a));
  return '<section class="card glow"><span class="label">Disponible</span><div class="big num">' + (total < 0 ? '<small>−</small>' : '') + '<small>$</small>' + nf.format(Math.abs(total)) + '</div>' +
    '<p class="note" style="padding:0;margin:-4px 0 10px">Suma ' + plural(marcadas.length, 'cuenta marcada', 'cuentas marcadas') + ' · Patrimonio total ' + money(patrimonio) + (cambiado ? ' · <button class="lnk" data-dselreset>Volver a lo normal</button>' : '') + '</p>' +
    '<div class="dist" aria-hidden="true">' + pos.map(a => '<i style="width:' + (b[a.id] / posTotal * 100).toFixed(1) + '%;background:' + col(a) + '"></i>').join('') + '</div>' +
    '<div class="distlg">' + pos.map(a => '<div><i style="background:' + col(a) + '"></i><span>' + esc(accShort(a.id)) + '</span><b class="num">' + Math.round(b[a.id] / posTotal * 100) + '% · ' + money(b[a.id]) + '</b></div>').join('') + '</div>' +
    '<details class="fold dsel-box"' + (cambiado ? ' open' : '') + '><summary>Qué cuenta en este total<span>' + marcadas.length + ' de ' + todas.length + '</span></summary>' +
      grupo('Efectivo', orden.filter(a => esEfectivoAcc(madreDe(a) || a)), true) + grupo('Cuentas', orden.filter(a => !esEfectivoAcc(madreDe(a) || a)), true) +
      grupo('Tarjetas de crédito', todas.filter(isCard)) + grupo('Deudas', todas.filter(esDeuda)) +
      '<p class="note" style="padding:0;margin:4px 0 0">Marca o desmarca para ver cuánto tendrías. Solo cambia este total, en este celular: tus cuentas no se tocan.</p></details></section>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-dsel],[data-dselreset]'); if (!el) return; e.stopPropagation();
  if (el.dataset.dsel) return dispMarcar(el.dataset.dsel);
  try { localStorage.removeItem(DSEL); } catch (_) {} render();
}, true);

function vCuentas(){
  const b = balances(), tops = cuentasOrden().filter(a => !madreDe(a) && !isCard(a));
  const efectivo = tops.filter(esEfectivoAcc), resto = tops.filter(a => !esEfectivoAcc(a));
  const totalDe = a => (b[a.id] || 0) + subsDe(a.id).reduce((x, s) => x + (b[s.id] || 0), 0);
  const editar = a => '<button class="pill" data-accedit="' + esc(a.id) + '" aria-label="Editar ' + esc(a.name) + '">Editar</button>';
  const fila = a => '<div class="accrow"><button class="acc" data-accsheet="' + esc(a.id) + '"><span class="nm">' + esc(a.name) + '<small>' + (a.apart ? 'Apartada · ' : '') + cuadreTxt(a.id) + '</small></span>' +
    '<span class="am num ' + ((b[a.id] || 0) < 0 ? 'neg' : '') + '">' + money(b[a.id] || 0) + '</span></button>' + editar(a) + '</div>';
  /* cuenta con bolsillos: un bloque con su total y, debajo, cada bolsillo unido por una línea */
  const bloque = a => { const subs = subsDe(a.id); if (!subs.length) return fila(a);
    const propia = b[a.id] || 0, tot = totalDe(a);
    return '<div class="accgrp"><div class="accrow"><button class="acc" data-accsheet="' + esc(a.id) + '"><span class="nm">' + esc(a.name) + '<small>' + (a.apart ? 'Apartada · ' : '') + plural(subs.length, 'bolsillo', 'bolsillos') + '</small></span>' +
      '<span class="am num ' + (tot < 0 ? 'neg' : '') + '">' + money(tot) + '</span></button>' + editar(a) + '</div><div class="bols">' +
      subs.map(s => '<div class="accrow bol"><button class="acc" data-accsheet="' + esc(s.id) + '"><span class="nm">' + esc(s.name) + '<small>' + (s.apart ? 'Apartado · ' : '') + cuadreTxt(s.id) + '</small></span>' +
        '<span class="am num ' + ((b[s.id] || 0) < 0 ? 'neg' : '') + '">' + money(b[s.id] || 0) + '</span></button>' + editar(s) + '</div>').join('') +
      (propia ? '<div class="accrow bol"><div class="acc"><span class="nm">Sin bolsillo<small>En ' + esc(a.name) + ', fuera de los bolsillos</small></span><span class="am num ' + (propia < 0 ? 'neg' : '') + '">' + money(propia) + '</span></div></div>' : '') +
      '<button class="lnk bol-add" data-accedit="" data-madre="' + esc(a.id) + '">+ Bolsillo en ' + esc(a.name) + '</button></div></div>'; };
  /* banco con varios bolsillos por nombre: el banco arriba con su total y cada bolsillo debajo */
  const banco = g => { const tot = g.list.reduce((x, a) => x + totalDe(a), 0);
    return '<div class="accgrp"><div class="accrow"><div class="acc"><span class="nm">' + esc(g.banco) + '<small>' + plural(g.list.length, 'bolsillo', 'bolsillos') + '</small></span>' +
      '<span class="am num ' + (tot < 0 ? 'neg' : '') + '">' + money(tot) + '</span></div></div><div class="bols">' +
      g.list.map(a => '<div class="accrow bol"><button class="acc" data-accsheet="' + esc(a.id) + '"><span class="nm">' + esc(nombreBolsillo(a)) + '<small>' + (a.apart ? 'Apartado · ' : '') + cuadreTxt(a.id) + '</small></span>' +
        '<span class="am num ' + (totalDe(a) < 0 ? 'neg' : '') + '">' + money(totalDe(a)) + '</span></button>' + editar(a) + '</div>').join('') + '</div></div>'; };
  const lista = l => agruparPorBanco(l).map(x => x.acc ? bloque(x.acc) : banco(x)).join('');
  const seccion = (tit, l, nuevo) => '<section class="card"><div class="card-h"><h2>' + tit + '</h2>' + (nuevo ? '<button class="pill" data-newacc>+ Nueva</button>' : '<span class="aside num">' + money(l.reduce((x, a) => x + totalDe(a), 0)) + '</span>') + '</div>' +
    (l.length ? '<div>' + lista(l) + '</div>' : '<p class="insight">Aún no tienes cuentas aquí.</p>') +
    (nuevo && l.length ? '<p class="note" style="padding:0;margin:0">Total ' + money(l.reduce((x, a) => x + totalDe(a), 0)) + '</p>' : '') + '</section>';
  let out = '<div class="hello"><h1>Cuentas</h1><p>' + plural(agruparPorBanco(tops).length, 'cuenta activa', 'cuentas activas') + '</p></div>';
  out += dispCard(b);
  if (efectivo.length) out += seccion('Efectivo', efectivo, false);
  out += seccion('Cuentas', resto, true);
  out += cardSummary() + deudasCard();
  if (aiOn()) out += '<button class="btn block ghost" data-foto>Cuadrar con captura</button>';
  out += '<p class="note">Toca una cuenta para ver sus movimientos o cuadrarla con el saldo real del banco. Con Editar le cambias el nombre o el orden, o le creas bolsillos.</p>';
  return out;
}
