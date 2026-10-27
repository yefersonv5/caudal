/* ---------- rubros del plan editables en la hoja del plan: mover plata entre rubros sin cambiar el total ----------
   Cada rubro se sube o se baja con − / + o escribiendo el valor. La barra fija dice siempre si el total quedó
   igual, si te pasas o si hay plata sin asignar, y propone de qué rubro sacar o a cuál llevar la diferencia.
   "Compensar con" elige un rubro que absorbe al instante cada cambio. Solo se guarda cuando el total quedó igual.
   Si la versión es la vigente y empezó en un periodo anterior, el cambio se guarda como versión nueva desde el
   periodo actual: los meses pasados se siguen comparando con lo que tenían. */
let AJ = null;
const AJ_PASOS = [5000, 10000, 50000];

/* prepara el estado para la hoja del plan; si se redibuja la misma versión, conserva lo que no se ha guardado */
function ajIniciar(pl){
  /* solo se conserva si la hoja sigue abierta (volver de un rubro o redibujar); al reabrirla se empieza limpio */
  const p = period(0), vivo = planFor(p) === pl, prev = AJ && AJ.pl === pl && $('#sheet').classList.contains('on') ? AJ : null;
  const base = {}, amt = {};
  for (const i of pl.items) { base[i.id] = i.amount || 0; amt[i.id] = prev && prev.base[i.id] === base[i.id] && i.id in prev.amt ? prev.amt[i.id] : base[i.id]; }
  AJ = { pl, p, vivo, R:vivo ? planReal(pl, p) : null, base, amt, total:Object.values(base).reduce((a, v) => a + v, 0),
    comp:prev && prev.comp in base ? prev.comp : null, paso:prev ? prev.paso : AJ_PASOS[1] };
}
const ajSum = () => Object.values(AJ.amt).reduce((a, v) => a + v, 0);
const ajItem = id => AJ.pl.items.find(i => i.id === id);
/* lo ya gastado o guardado en el periodo actual; bajar de ahí deja el rubro pasado */
const ajUsado = i => AJ.R ? AJ.R.r[i.id] || 0 : 0;
const ajCambios = () => AJ.pl.items.filter(i => AJ.amt[i.id] !== AJ.base[i.id]);
const ajNueva = () => AJ.vivo && AJ.pl.start < AJ.p.s;

/* cambia un rubro y, si hay rubro para compensar, le pasa la diferencia */
function ajPoner(id, v){
  v = Math.max(0, Math.round(v)); const d = v - AJ.amt[id]; AJ.amt[id] = v;
  if (AJ.comp && AJ.comp !== id) AJ.amt[AJ.comp] = Math.max(0, AJ.amt[AJ.comp] - d);
}
/* rubro sugerido para cuadrar: si sobra plata, el primer ahorro (o el rubro más grande);
   si falta, el rubro sin tocar con más margen libre (su valor menos lo ya gastado) */
function ajSugerido(dif){
  const libres = AJ.pl.items.filter(i => AJ.amt[i.id] === AJ.base[i.id]);
  if (dif > 0) return libres.find(i => !isGastoItem(i)) || libres.slice().sort((a, b) => AJ.amt[b.id] - AJ.amt[a.id])[0] || null;
  const margen = i => AJ.amt[i.id] - ajUsado(i);
  return libres.filter(i => !isFijo(i) && margen(i) >= -dif).sort((a, b) => margen(b) - margen(a))[0] || null;
}

/* bloque de rubros para la hoja del plan; el nombre abre el rubro completo, − / + y el campo cambian el valor */
function ajBloque(){
  const grupos = CLS.concat([['_otros', PAL.gris]]).map(([k, col]) => [k, col, AJ.pl.items.filter(i => k === '_otros' ? !CLS.some(c => c[0] === i.cls) : i.cls === k)]).filter(g => g[2].length);
  let h = '<div class="aj" id="aj-rubros"><div class="card-h" style="margin-bottom:4px"><span class="label">Rubros</span><button class="pill" type="button" data-padd>Agregar</button></div>';
  if (!AJ.pl.items.length) return h + '<p class="note" style="padding:0">Aún no tienes rubros.</p></div>';
  h += '<div class="aj-bar" id="aj-bar"></div>' +
    '<div class="aj-opc"><label class="label" for="aj-comp">Compensar con</label><select class="inp" id="aj-comp"><option value="">Lo cuadro yo</option>' +
      AJ.pl.items.map(i => '<option value="' + esc(i.id) + '"' + (AJ.comp === i.id ? ' selected' : '') + '>' + esc(i.name) + '</option>').join('') + '</select>' +
    '<span class="label">Cada toque mueve</span><div class="pills">' + AJ_PASOS.map(v => '<button class="pill" type="button" data-ajpaso="' + v + '" aria-pressed="' + (AJ.paso === v) + '">' + nf.format(v / 1000) + ' mil</button>').join('') + '</div></div>';
  for (const [k, col, its] of grupos) {
    h += '<div class="pgroup"><i style="background:' + col + '"></i>' + (k === '_otros' ? 'Otros' : k) + '<span class="num" data-ajg="' + esc(k) + '"></span></div>';
    for (const i of its) h += '<div class="aj-row" data-ajrow="' + esc(i.id) + '"><button type="button" class="t" data-pitem="' + esc(i.id) + '"><b>' + esc(i.name) + '</b><span data-ajmeta></span></button>' +
      '<div class="aj-ctl"><button type="button" class="aj-step" data-ajmenos="' + esc(i.id) + '" aria-label="Bajar ' + esc(i.name) + '">−</button>' +
      '<input inputmode="numeric" class="num" data-ajamt="' + esc(i.id) + '" aria-label="Valor de ' + esc(i.name) + '">' +
      '<button type="button" class="aj-step" data-ajmas="' + esc(i.id) + '" aria-label="Subir ' + esc(i.name) + '">+</button></div></div>';
  }
  return h + '<div id="aj-acc" hidden><button class="btn block" type="button" id="aj-ok">Guardar cambios</button><button class="btn ghost block" type="button" id="aj-undo">Deshacer cambios</button>' +
    '<p class="note" style="padding:0">' + (ajNueva() ? 'Se guarda como versión nueva desde el ' + fmtShort(AJ.p.start) + ': los meses anteriores se siguen comparando con lo que tenían.' : 'Se guarda en esta versión.') + '</p></div></div>';
}

/* actualiza cifras sin redibujar, para no perder el campo donde se escribe */
function ajRefresh(){
  if (!AJ || !$('#aj-bar')) return;
  const dif = AJ.total - ajSum(), foco = document.activeElement, n = ajCambios().length, libre = AJ.pl.income - AJ.total;
  let bar = '<div><span class="label">Total de rubros</span><b class="num">' + money(AJ.total) + '</b><span class="tile-s">de ' + money(AJ.pl.income) + (libre ? ' · ' + (libre > 0 ? 'sin asignar ' : 'asignas de más ') + money(Math.abs(libre)) : '') + '</span></div>';
  if (dif === 0) bar += '<div class="aj-est pos">' + (n ? 'Cuadrado ✓' : 'Total fijo') + '</div>';
  else {
    const s = AJ.comp ? null : ajSugerido(dif);
    bar += '<div class="aj-est ' + (dif < 0 ? 'neg' : 'warn') + '">' + (dif < 0 ? 'Te pasas ' + money(-dif) : 'Te sobran ' + money(dif)) + '</div>' +
      (s ? '<button class="pill solid" type="button" data-ajcuadrar="' + esc(s.id) + '">' + (dif < 0 ? 'Sacarlo de ' : 'Llevarlo a ') + esc(s.name) + '</button>' : AJ.comp ? '<span class="tile-s">' + esc(ajItem(AJ.comp).name) + ' ya no alcanza</span>' : '');
  }
  $('#aj-bar').innerHTML = bar;
  for (const i of AJ.pl.items) {
    const row = document.querySelector('[data-ajrow="' + i.id + '"]'); if (!row) continue;
    const v = AJ.amt[i.id], d = v - AJ.base[i.id], u = ajUsado(i), g = isGastoItem(i), inp = row.querySelector('input');
    if (inp !== foco) inp.value = nf.format(v);
    row.classList.toggle('on', d !== 0); row.classList.toggle('comp', AJ.comp === i.id);
    const uso = !AJ.R ? (g ? 'gasto' : 'ahorro') + ' · ' + accShort(i.acc) : g && !quietItem(i) && v < u ? '<b class="neg">ya gastaste ' + money(u) + '</b>' : !g ? 'Guardado ' + money(u) : u ? 'Libre ' + money(v - u) : 'Sin gastar';
    row.querySelector('[data-ajmeta]').innerHTML = (d ? '<b class="' + (d > 0 ? 'pos' : '') + '">' + money(d, true) + '</b> · ' : '') + uso + (AJ.comp === i.id ? ' · compensa' : '');
  }
  document.querySelectorAll('[data-ajg]').forEach(el => { const k = el.dataset.ajg;
    el.textContent = money(AJ.pl.items.filter(i => k === '_otros' ? !CLS.some(c => c[0] === i.cls) : i.cls === k).reduce((a, i) => a + AJ.amt[i.id], 0)); });
  $('#aj-acc').hidden = !n;
  const ok = $('#aj-ok'); ok.disabled = dif !== 0;
  ok.textContent = dif !== 0 ? 'Cuadra el total para guardar' : 'Guardar ' + n + (n === 1 ? ' cambio' : ' cambios');
}

/* guarda en esta versión, o en una nueva desde el periodo actual si la vigente viene de antes; devuelve la versión */
function ajGuardar(){
  let pl = AJ.pl; const n = ajCambios().length, nueva = ajNueva();
  if (nueva) {
    pl = { ...JSON.parse(JSON.stringify(pl)), id:uid(), name:'Plan ' + MESL[AJ.p.start.getMonth()] + ' ' + AJ.p.start.getFullYear(), start:AJ.p.s };
    pl.items.forEach(i => { i.amount = AJ.amt[i.id]; i.id = uid(); });
    S.plans.push(pl);
  } else pl.items.forEach(i => i.amount = AJ.amt[i.id]);
  AJ = null; save(); render();
  toast(nueva ? 'Guardado como ' + pl.name + ', desde el ' + fmtShort(parseISO(pl.start)) : n === 1 ? 'Rubro reacomodado' : n + ' rubros reacomodados', 3000);
  return pl;
}

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  /* desde la tarjeta Rubros: abre la hoja del plan vigente directo en los rubros */
  if (d.preac !== undefined) { e.stopPropagation(); const pl = planFor(period(0)); if (!pl) return; planSheet(pl); const r = $('#aj-rubros'); if (r) r.scrollIntoView({ block:'start' }); return; }
  /* "Listo" con cambios sin guardar: guarda si el total cuadra; si no, avisa y no cierra */
  if (el.id === 'p-listo' && AJ && AJ.pl === PF && ajCambios().length) { e.stopPropagation();
    if (AJ.total !== ajSum()) { $('#aj-bar').scrollIntoView({ block:'center', behavior:'smooth' }); return toast('Cuadra el total o deshaz los cambios'); }
    ajGuardar(); return closeSheet(); }
  if (!AJ || !el.closest('.aj')) return;
  if (d.pitem || d.padd !== undefined) return; /* lo atiende plan.js */
  e.stopPropagation();
  if (d.ajpaso) { AJ.paso = +d.ajpaso; document.querySelectorAll('[data-ajpaso]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  if (d.ajmenos) { ajPoner(d.ajmenos, AJ.amt[d.ajmenos] - AJ.paso); return ajRefresh(); }
  if (d.ajmas) { ajPoner(d.ajmas, AJ.amt[d.ajmas] + AJ.paso); return ajRefresh(); }
  if (d.ajcuadrar) { const id = d.ajcuadrar; AJ.amt[id] = Math.max(0, AJ.amt[id] + AJ.total - ajSum()); return ajRefresh(); }
  if (el.id === 'aj-undo') { AJ.amt = { ...AJ.base }; return ajRefresh(); }
  if (el.id === 'aj-ok' && !el.disabled) return planSheet(ajGuardar());
}, true);
document.addEventListener('input', e => {
  const id = e.target.dataset && e.target.dataset.ajamt; if (!id || !AJ) return;
  ajPoner(id, pesosCampo(e.target)); ajRefresh();
});
document.addEventListener('change', e => {
  if (e.target.id === 'p-inc') return ajRefresh(); /* la barra muestra cuánto queda sin asignar del ingreso */
  if (e.target.id !== 'aj-comp' || !AJ) return;
  /* al elegirlo, el rubro también absorbe lo que estaba descuadrado */
  AJ.comp = e.target.value || null;
  if (AJ.comp) AJ.amt[AJ.comp] = Math.max(0, AJ.amt[AJ.comp] + AJ.total - ajSum());
  ajRefresh();
});
