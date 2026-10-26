/* ---------- Intereses del mes ----------
   El banco paga el rendimiento de los bolsillos el día 3 de cada mes (INT_DIA). Del 3 al 12, Inicio lo recuerda
   hasta que haya un ingreso de Rendimientos desde ese día, y el día 3 llega un aviso push.
   Se registran con una captura (cada bolsillo contra Caudal: la diferencia es el interés) o a mano, con un
   estimado según la tasa de Ajustes (S.settings.rate, % efectivo anual). Una diferencia muy por encima de lo
   esperado no se toma como interés: casi siempre es un movimiento sin registrar, y se revisa con el cuadre. */
const INT_DIA = 3;
let INT = null;
const intCat = () => S.categories.find(c => c.type === 'ingreso' && !c.parentId && /rendim|inter[eé]s/i.test(c.name)) || null;
function intCatCrear(){
  let c = intCat();
  if (!c) { c = { id:uid(), name:'Rendimientos', emoji:'📈', type:'ingreso', parentId:null, order:999, hidden:false }; S.categories.push(c); }
  return c;
}
/* bolsillos que rinden: cuentas con saldo que no son tarjeta, deuda, efectivo ni de paso */
const intCuentas = () => { const B = balances(); return S.accounts.filter(a => !a.hidden && !isCard(a) && !esDeuda(a) && !esEfectivo(a.id) && !esPaso(a) && (B[a.id] || 0) > 0); };
const intEstimado = bal => S.settings.rate ? Math.round(bal * (Math.pow(1 + S.settings.rate / 100, 1 / 12) - 1)) : 0;
/* parece interés si no pasa del doble de lo esperado (o de $20.000 si no hay tasa) */
const intCreible = (bal, v) => v > 0 && v <= Math.max(intEstimado(bal) * 2, S.settings.rate ? 1000 : 20000);
const intDesde = () => { const d = new Date(); return iso(new Date(d.getFullYear(), d.getMonth(), INT_DIA)); };
const intHechos = () => { const c = intCat(), desde = intDesde(); return c ? S.transactions.filter(t => t.type === 'ingreso' && t.categoryId === c.id && t.date >= desde) : []; };

function interesesBanner(){
  const hoy = new Date().getDate();
  if (S.demo || hoy < INT_DIA || hoy > 12 || intHechos().length || lsGet('int.luego') === iso(new Date()) || !intCuentas().length) return '';
  return '<div class="banner"><span><b>Llegaron los intereses del mes.</b> Regístralos para que tus bolsillos sigan cuadrados.</span><span style="display:flex;gap:6px;flex-wrap:wrap">' +
    '<button class="btn sm ghost" data-intluego>Aún no</button>' + (aiOn() ? '<button class="btn sm" data-intfoto>Con captura</button>' : '') + '<button class="btn sm' + (aiOn() ? ' ghost' : '') + '" data-intmano>A mano</button></span></div>';
}

/* registro a mano: un campo por bolsillo, sugerido con el estimado */
function intOpen(){
  const B = balances();
  INT = { amt:{} }; for (const a of intCuentas()) INT.amt[a.id] = intEstimado(B[a.id] || 0);
  intDraw();
}
function intDraw(){
  const B = balances(), tot = Object.values(INT.amt).reduce((a, v) => a + v, 0);
  let h = '<div class="sheet-h"><b id="sheet-title">Intereses del mes</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form int">' +
    '<p class="insight" style="margin:0">Escribe lo que pagó cada bolsillo.' + (S.settings.rate ? ' Viene sugerido con tu tasa del ' + S.settings.rate + '% anual; cámbialo por lo que dice el banco.' : '') + '</p>';
  h += intCuentas().map(a => '<div class="set"><div class="t"><b>' + esc(accShort(a.id)) + '</b><span>Tiene ' + money(B[a.id] || 0) + '</span></div><div class="rv-amt" style="max-width:150px"><span>$</span><input inputmode="numeric" class="num" data-intacc="' + esc(a.id) + '" value="' + (INT.amt[a.id] ? nf.format(INT.amt[a.id]) : '') + '" placeholder="0"></div></div>').join('');
  h += '<button class="btn accent block" data-intgo' + (tot ? '' : ' disabled') + '>Registrar ' + money(tot) + '</button></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
/* deja cada interés como un ingreso de Rendimientos en su bolsillo */
function intRegistrar(montos){
  const c = intCatCrear(); let n = 0;
  for (const [acc, v] of Object.entries(montos)) if (v > 0) { S.transactions.push({ id:uid(), type:'ingreso', amount:Math.round(v), date:iso(new Date()), ts:Date.now() + n, accountId:acc, categoryId:c.id, note:'Intereses del mes', src:'intereses' }); n++; }
  if (n) { sortTx(S); save(); render(); toast(n === 1 ? 'Interés registrado' : n + ' intereses registrados'); }
  return n;
}

document.addEventListener('input', e => {
  const k = e.target.dataset && e.target.dataset.intacc; if (!k || !INT) return;
  const v = leerPesos(e.target.value); INT.amt[k] = v; e.target.value = v ? nf.format(v) : '';
  const tot = Object.values(INT.amt).reduce((a, x) => a + x, 0), b = document.querySelector('[data-intgo]');
  if (b) { b.disabled = !tot; b.textContent = 'Registrar ' + money(tot); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.intluego !== undefined) { e.stopPropagation(); lsSet('int.luego', iso(new Date())); return render(); }
  if (d.intmano !== undefined) { e.stopPropagation(); return intOpen(); }
  if (d.intfoto !== undefined) { e.stopPropagation(); FS = { files:[], res:null, busy:false, modo:'int' }; return fsDraw(); }
  if (d.intgo !== undefined && INT) { e.stopPropagation(); const m = INT.amt; INT = null; closeSheet(); intRegistrar(m); }
}, true);
