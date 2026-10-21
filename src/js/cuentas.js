/* Cuentas: saldos agrupados y reparto del disponible. */
function vCuentas(){
  const b = balances();
  const vis = S.accounts.filter(a => !a.hidden);
  const worth = vis.reduce((x, a) => x + (b[a.id] || 0), 0);
  const groups = [];
  for (const a of vis) { let g = groups.find(x => x.name === a.group); if (!g) groups.push(g = { name:a.group, list:[] }); g.list.push(a); }
  groups.sort((x, y) => y.list.reduce((s, a) => s + (b[a.id] || 0), 0) - x.list.reduce((s, a) => s + (b[a.id] || 0), 0));
  groups.forEach((g, i) => { g.sum = g.list.reduce((x, a) => x + (b[a.id] || 0), 0); g.col = serieColor(i); });
  const posTotal = groups.reduce((x, g) => x + Math.max(0, g.sum), 0) || 1;
  let out = '<div class="hello"><h1>Cuentas</h1><p>' + vis.length + ' cuentas activas</p></div>';
  const aparts = vis.filter(a => a.apart), apartSum = aparts.reduce((x, a) => x + (b[a.id] || 0), 0), disp = worth - apartSum;
  out += '<section class="card glow"><span class="label">Disponible</span><div class="big num">' + (disp < 0 ? '<small>−</small>' : '') + '<small>$</small>' + nf.format(Math.abs(disp)) + '</div>' +
    '<p class="note" style="padding:0;margin:-4px 0 10px">' + (aparts.length ? 'Apartado ' + money(apartSum) + ' (' + esc(aparts.map(a => accShort(a.id)).join(', ')) + ') · ' : '') + 'Patrimonio total ' + money(worth) + (S.accounts.some(a => isCard(a)) ? '. Ya descuenta lo que debes en la tarjeta.' : '') + '</p>' +
    '<div class="dist" aria-hidden="true">' + groups.filter(g => g.sum > 0).map(g => '<i style="width:' + (g.sum / posTotal * 100).toFixed(1) + '%;background:' + g.col + '"></i>').join('') + '</div>' +
    '<div class="distlg">' + groups.map(g => '<div><i style="background:' + g.col + '"></i><span>' + esc(g.name) + '</span><b class="num">' + (g.sum > 0 ? Math.round(g.sum / posTotal * 100) + '% · ' : '') + money(g.sum) + '</b></div>').join('') + '</div></section>';
  out += cardSummary();
  for (const g of groups) {
    out += '<section class="card"><div class="card-h"><h2>' + esc(g.name) + '</h2><span class="aside num">' + money(g.sum) + '</span></div><div>' +
      g.list.map(a => '<button class="acc" data-accsheet="' + esc(a.id) + '"><span class="nm">' + esc(a.name) + '<small>' + (a.apart ? 'Apartado · ' : '') + cuadreTxt(a.id) + '</small></span><span class="am num ' + ((b[a.id] || 0) < 0 ? 'neg' : '') + '">' + money(b[a.id] || 0) + '</span><svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg></button>').join('') + '</div></section>';
  }
  out += '<div class="two"><button class="btn ghost" data-newacc>Agregar cuenta</button>' + (aiOn() ? '<button class="btn" data-foto>Cuadrar con captura</button>' : '<span></span>') + '</div>';
  out += '<p class="note">Toca una cuenta para cuadrarla con el saldo real del banco o ver sus movimientos.</p>';
  return out;
}
