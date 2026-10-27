/* ---------- reacomodar el plan a mitad de mes: mover plata entre rubros sin cambiar el total ----------
   Cada rubro se sube o se baja con − / + o escribiendo el valor. Arriba se ve siempre cuánto falta o sobra
   para volver al total. "Compensar con" elige un rubro que absorbe al instante cada cambio, así el total
   nunca se mueve. Solo se guarda cuando el total quedó igual.
   Para no reescribir la historia, si el plan vigente empezó en un periodo anterior, el ajuste se guarda
   como una versión nueva desde el periodo actual (los meses pasados se siguen comparando con lo que tenían). */
let AJ = null;
const AJ_PASOS = [5000, 10000, 50000];

function ajOpen(){
  const p = period(0), pl = planFor(p); if (!pl || !pl.items.length) return toast('Primero arma tu plan');
  const base = {}; pl.items.forEach(i => base[i.id] = i.amount || 0);
  AJ = { pl, p, R:planReal(pl, p), base, amt:{ ...base }, comp:null, total:planTotal(pl), paso:AJ_PASOS[1] };
  ajDraw();
}
const ajSum = () => Object.values(AJ.amt).reduce((a, v) => a + v, 0);
const ajItem = id => AJ.pl.items.find(i => i.id === id);
/* lo que ya se gastó o guardó en el rubro: bajar de ahí deja el rubro pasado */
const ajUsado = i => AJ.R.r[i.id] || 0;
const ajCambios = () => AJ.pl.items.filter(i => AJ.amt[i.id] !== AJ.base[i.id]);

/* cambia un rubro y, si hay rubro para compensar, le pasa la diferencia */
function ajPoner(id, v){
  v = Math.max(0, Math.round(v)); const d = v - AJ.amt[id]; AJ.amt[id] = v;
  if (AJ.comp && AJ.comp !== id) AJ.amt[AJ.comp] = Math.max(0, AJ.amt[AJ.comp] - d);
}
/* rubro sugerido para cuadrar: si sobra plata, el primer ahorro (o el rubro más grande);
   si falta, el rubro sin tocar con más margen libre (lo que tiene menos lo ya gastado) */
function ajSugerido(dif){
  const libres = AJ.pl.items.filter(i => AJ.amt[i.id] === AJ.base[i.id]);
  if (dif > 0) return libres.find(i => !isGastoItem(i)) || libres.slice().sort((a, b) => AJ.amt[b.id] - AJ.amt[a.id])[0] || null;
  const margen = i => AJ.amt[i.id] - ajUsado(i);
  return libres.filter(i => !isFijo(i) && margen(i) >= -dif).sort((a, b) => margen(b) - margen(a))[0] || null;
}

function ajDraw(){
  const grupos = CLS.concat([['_otros', PAL.gris]]).map(([k, col]) => [k, col, AJ.pl.items.filter(i => k === '_otros' ? !CLS.some(c => c[0] === i.cls) : i.cls === k)]).filter(g => g[2].length);
  let h = '<div class="sheet-h"><b id="sheet-title">Reacomodar el plan</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form aj">' +
    '<div class="aj-bar" id="aj-bar"></div>' +
    '<div class="field"><label class="label" for="aj-comp">Compensar con</label><select class="inp" id="aj-comp"><option value="">Lo cuadro yo</option>' +
      AJ.pl.items.map(i => '<option value="' + esc(i.id) + '">' + esc(i.name) + '</option>').join('') + '</select><span class="tile-s">El rubro que elijas recibe o entrega lo que muevas en los demás, así el total no cambia.</span></div>' +
    '<div class="field"><span class="label">Cada toque de − o + mueve</span><div class="pills">' + AJ_PASOS.map(v => '<button class="pill" type="button" data-ajpaso="' + v + '" aria-pressed="' + (AJ.paso === v) + '">' + nf.format(v / 1000) + ' mil</button>').join('') + '</div></div>';
  for (const [k, col, its] of grupos) {
    h += '<div class="pgroup"><i style="background:' + col + '"></i>' + (k === '_otros' ? 'Otros' : k) + '<span class="num" data-ajg="' + esc(k) + '"></span></div>';
    for (const i of its) h += '<div class="aj-row" data-ajrow="' + esc(i.id) + '"><div class="t"><b>' + esc(i.name) + '</b><span data-ajmeta></span></div>' +
      '<div class="aj-ctl"><button type="button" class="aj-step" data-ajmenos="' + esc(i.id) + '" aria-label="Bajar ' + esc(i.name) + '">−</button>' +
      '<input inputmode="numeric" class="num" data-ajamt="' + esc(i.id) + '" aria-label="Valor de ' + esc(i.name) + '">' +
      '<button type="button" class="aj-step" data-ajmas="' + esc(i.id) + '" aria-label="Subir ' + esc(i.name) + '">+</button></div></div>';
  }
  h += '<button class="btn block" type="button" id="aj-ok">Guardar cambios</button><button class="btn ghost block" type="button" id="aj-undo">Deshacer cambios</button>' +
    '<p class="note" style="padding:0">' + (AJ.pl.start < AJ.p.s ? 'Se guarda como una versión nueva desde el ' + fmtShort(AJ.p.start) + ': los meses anteriores se siguen comparando con lo que tenían.' : 'Se guarda en la versión de este periodo.') + ' Si ya repartiste el sueldo, Repartir te mostrará lo que falte mover.</p></div>';
  openSheet(h);
  ajRefresh();
}

/* actualiza cifras sin redibujar, para no perder el campo donde se escribe */
function ajRefresh(){
  const dif = AJ.total - ajSum(), foco = document.activeElement, n = ajCambios().length;
  let bar = '<div><span class="label">Total del plan</span><b class="num">' + money(AJ.total) + '</b></div>';
  if (dif === 0) bar += '<div class="aj-est pos">' + (n ? 'Cuadrado ✓' : 'Sin cambios') + '</div>';
  else {
    const s = AJ.comp ? null : ajSugerido(dif);
    bar += '<div class="aj-est ' + (dif < 0 ? 'neg' : 'warn') + '">' + (dif < 0 ? 'Te pasas ' + money(-dif) : 'Sin asignar ' + money(dif)) + '</div>' +
      (s ? '<button class="pill solid" type="button" data-ajcuadrar="' + esc(s.id) + '">' + (dif < 0 ? 'Sacarlo de ' : 'Llevarlo a ') + esc(s.name) + '</button>' : AJ.comp ? '<span class="tile-s">' + esc(ajItem(AJ.comp).name) + ' ya no alcanza</span>' : '');
  }
  $('#aj-bar').innerHTML = bar;
  for (const i of AJ.pl.items) {
    const row = document.querySelector('[data-ajrow="' + i.id + '"]'); if (!row) continue;
    const v = AJ.amt[i.id], d = v - AJ.base[i.id], u = ajUsado(i), g = isGastoItem(i), inp = row.querySelector('input');
    if (inp !== foco) inp.value = nf.format(v);
    row.classList.toggle('on', d !== 0); row.classList.toggle('comp', AJ.comp === i.id);
    const bajo = g && !quietItem(i) && v < u;
    row.querySelector('[data-ajmeta]').innerHTML = (d ? '<b class="' + (d > 0 ? 'pos' : '') + '">' + money(d, true) + '</b> · ' : '') +
      (bajo ? '<b class="neg">ya gastaste ' + money(u) + '</b>' : !g ? 'Guardado ' + money(u) : u ? 'Libre ' + money(v - u) : 'Sin gastar') +
      (AJ.comp === i.id ? ' · compensa' : '');
  }
  document.querySelectorAll('[data-ajg]').forEach(el => { const k = el.dataset.ajg;
    el.textContent = money(AJ.pl.items.filter(i => k === '_otros' ? !CLS.some(c => c[0] === i.cls) : i.cls === k).reduce((a, i) => a + AJ.amt[i.id], 0)); });
  const ok = $('#aj-ok'); ok.disabled = dif !== 0 || !n;
  ok.textContent = dif !== 0 ? 'Cuadra el total para guardar' : n ? 'Guardar ' + n + (n === 1 ? ' cambio' : ' cambios') : 'Guardar cambios';
}

/* guarda: en la versión de este periodo, o en una nueva desde hoy si la vigente viene de antes */
function ajGuardar(){
  let pl = AJ.pl;
  if (pl.start < AJ.p.s) {
    pl = { ...JSON.parse(JSON.stringify(pl)), id:uid(), name:'Plan ' + MESL[AJ.p.start.getMonth()] + ' ' + AJ.p.start.getFullYear(), start:AJ.p.s };
    pl.items.forEach(i => { i.amount = AJ.amt[i.id]; i.id = uid(); });
    S.plans.push(pl);
  } else pl.items.forEach(i => i.amount = AJ.amt[i.id]);
  const n = ajCambios().length; AJ = null;
  save(); closeSheet(); render(); toast(n === 1 ? 'Rubro reacomodado' : n + ' rubros reacomodados', 2600);
}

document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.preac !== undefined) { e.stopPropagation(); return ajOpen(); }
  if (!AJ || !el.closest('.aj')) return; e.stopPropagation();
  if (d.ajpaso) { AJ.paso = +d.ajpaso; document.querySelectorAll('[data-ajpaso]').forEach(b => b.setAttribute('aria-pressed', b === el)); return; }
  if (d.ajmenos) { ajPoner(d.ajmenos, AJ.amt[d.ajmenos] - AJ.paso); return ajRefresh(); }
  if (d.ajmas) { ajPoner(d.ajmas, AJ.amt[d.ajmas] + AJ.paso); return ajRefresh(); }
  if (d.ajcuadrar) { const id = d.ajcuadrar; AJ.amt[id] = Math.max(0, AJ.amt[id] + AJ.total - ajSum()); return ajRefresh(); }
  if (el.id === 'aj-undo') { AJ.amt = { ...AJ.base }; return ajRefresh(); }
  if (el.id === 'aj-ok' && !el.disabled) return ajGuardar();
}, true);
document.addEventListener('input', e => {
  const id = e.target.dataset && e.target.dataset.ajamt; if (!id || !AJ) return;
  ajPoner(id, pesosCampo(e.target)); ajRefresh();
});
document.addEventListener('change', e => {
  if (e.target.id !== 'aj-comp' || !AJ) return;
  /* al elegirlo, el rubro también absorbe lo que estaba descuadrado */
  AJ.comp = e.target.value || null;
  if (AJ.comp) AJ.amt[AJ.comp] = Math.max(0, AJ.amt[AJ.comp] + AJ.total - ajSum());
  ajRefresh();
});
