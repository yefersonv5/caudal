/* Deudas: tres cuentas fijas en el grupo "Deudas"; cada deuda puede llevar la persona (t.persona).
   Por pagar: lo que alguien pagó por ti (un gasto en Por pagar) o plata de otra persona que tienes en tu
     cuenta (una transferencia de Por pagar a tu cuenta). Su saldo es negativo y resta de tu disponible:
     esa plata está en tu cuenta pero no es tuya.
   En pausa: lo que debes y no tienes en tus cuentas (un ajuste negativo en la cuenta "Deudas en pausa",
     que está apartada). No resta de tu disponible hasta que la pagas desde una de tus cuentas.
   Por cobrar: lo que prestaste. Está apartada: no suma a tu disponible hasta que te paguen.
   Los pagos son transferencias con src 'deuda' y auto = id de la deuda, para saber cuánto falta de cada una.
   Prestar plata de otra persona: el préstamo lleva t.de = nombre de la dueña. Esa plata sale de su parte en tu cuenta
     (no de la tuya), no resta de tu disponible y, cuando te pagan, vuelve a quedar como suya en la cuenta donde llega. */
const DEUDA = { pagar:{ name:'Por pagar', orden:900 }, cobrar:{ name:'Por cobrar', orden:901 }, pausa:{ name:'Deudas en pausa', orden:902 } };
const esDeuda = a => !!(a && a.debt);
const deudaAcc = k => S.accounts.find(a => a.debt === k) || null;
function deudaCrear(k){
  let a = deudaAcc(k); if (a) return a;
  a = { id:uid(), name:DEUDA[k].name, group:'Deudas', order:DEUDA[k].orden, hidden:false, debt:k };
  if (k === 'cobrar' || k === 'pausa') a.apart = true;
  S.accounts.push(a); return a;
}
/* disponible: cuentas visibles que no están apartadas (Por cobrar y En pausa lo están; Por pagar resta con su saldo negativo) */
const dispTotal = b => S.accounts.filter(a => !a.hidden && !a.apart).reduce((s, a) => s + (b[a.id] || 0), 0) + prestadoAjeno();
/* lo que debes: ya está comprometido aunque la plata siga en tu cuenta */
const debesTotal = b => { const P = deudaAcc('pagar'); return P ? Math.max(0, -(b[P.id] || 0)) : 0; };

/* qué tipo de saldo con la persona es cada deuda: debes (le debes), suya (su plata la tienes tú), teDebe (te debe) */
const deudaClase = it => it.k === 'cobrar' ? 'teDebe' : it.guardo ? 'suya' : 'debes';
/* todas las deudas con sus abonos (de la más antigua a la más reciente); las abiertas son las que tienen saldo.
   Un abono puede ser de una sola deuda (auto = id de la deuda) o un pago por persona (auto = '*debes', '*suya' o '*teDebe'
   y persona): un solo movimiento que se reparte entre sus deudas de ese tipo, de la más vieja a la más nueva. */
let DCACHE = null;
function deudasTodas(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'), Z = deudaAcc('pausa'); if (!P && !C && !Z) { DCACHE = null; return []; }
  /* firma de todos los movimientos (fecha, tipo, cuentas, valor, persona…): si algo cambia, se recalcula */
  let firma = S.transactions.length + ':' + S.accounts.length;
  { let h = 0; for (const x of S.transactions) { const s = x.id + x.date + x.type + x.amount + (x.accountId || '') + (x.toAccountId || '') + (x.auto || '') + (x.persona || '') + (x.de || '') + (x.pending ? 1 : 0) + (x.ts || 0) + (x.src || '');
      for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; } firma += ':' + h; }
  if (DCACHE && DCACHE.tx === S.transactions && DCACHE.firma === firma) return DCACHE.out;
  const abonos = {}, porPersona = [], sobra = [];
  for (const x of S.transactions) if (x.type === 'transferencia' && x.src === 'deuda') { if (x.auto && x.auto[0] === '*') { if (x.persona) porPersona.push(x); } else if (x.auto) (abonos[x.auto] = abonos[x.auto] || []).push(x); }
  const out = [];
  for (const t of S.transactions) {
    const guardo = !!P && t.type === 'transferencia' && t.accountId === P.id && t.src !== 'deuda';
    const k = P && ((t.type === 'gasto' && t.accountId === P.id) || guardo) ? 'pagar'
      : C && t.type === 'transferencia' && t.toAccountId === C.id && t.src !== 'deuda' ? 'cobrar'
      : Z && t.type === 'ajuste' && t.accountId === Z.id && t.amount < 0 ? 'pausa' : null;
    if (!k) continue;
    const monto = Math.abs(t.amount), ab = (abonos[t.id] || []).slice(), pagado = ab.reduce((a, x) => a + x.amount, 0);
    out.push({ t, k, guardo, monto, abonos:ab, pagado, falta:Math.max(0, monto - pagado) });
  }
  out.sort((a, b) => a.t.date.localeCompare(b.t.date) || (a.t.ts || 0) - (b.t.ts || 0));
  porPersona.sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0));
  for (const x of porPersona) {
    const clase = x.auto.slice(1), quien = normP(x.persona); let resta = x.amount;
    for (const it of out) {
      if (resta <= 0) break;
      if (!it.falta || deudaClase(it) !== clase || normP(it.t.persona) !== quien) continue;
      const D = deudaAcc(it.k); if (!D || (clase === 'teDebe' ? x.accountId : x.toAccountId) !== D.id) continue;
      const parte = Math.min(resta, it.falta); resta -= parte;
      it.abonos.push(parte === x.amount ? x : { ...x, amount:parte, total:x.amount }); it.pagado += parte; it.falta -= parte;
    }
    if (resta > 0) sobra.push({ x, v:resta });
  }
  /* pagos que no caen en ninguna deuda: su deuda ya no existe o pagan de más. No se esconden: Personas los muestra */
  const ids = new Set(out.map(it => it.t.id));
  for (const id in abonos) if (!ids.has(id)) for (const x of abonos[id]) sobra.push({ x, v:x.amount });
  for (const it of out) if (it.pagado > it.monto) { const x = it.abonos[it.abonos.length - 1]; sobra.push({ x, v:it.pagado - it.monto }); }
  for (const it of out) it.abonos.sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0));
  DCACHE = { tx:S.transactions, firma, out, sobra, aj:null };
  return out;
}
const deudaSobrantes = () => { deudasTodas(); return DCACHE ? DCACHE.sobra : []; };
const deudaItem = id => deudasTodas().find(x => x.t.id === id) || null;
const deudasAbiertas = () => deudasTodas().filter(x => x.falta > 0);
/* plata de cada persona que tienes: { clave: { nombre, suya, fuera, usado, acc:{ id:v } } }.
   suya: lo que aún no le devuelves (lo mismo que dice Personas). Siempre se cumple suya = cuentas + fuera + usado:
     acc:    dónde está. Se sigue movimiento por movimiento, en orden: entra en la cuenta donde la recibiste; lo que gastas
             o sacas de una cuenta sale primero de tu plata, y solo cuando tu parte no alcanza toca la de otros: si es
             una transferencia a otra de tus cuentas, su plata se mueve con ella; si no, queda como usada.
     fuera:  lo que de su plata prestaste y aún no te pagan. Cuando te pagan, vuelve a ser suya en la cuenta donde llega.
     usado:  lo que de su plata ya no está en tus cuentas porque lo gastaste o pagaste algo con ella: le debes reponerlo. */
function ajenaPersonas(){
  const items = deudasTodas(); if (DCACHE && DCACHE.aj) return DCACHE.aj;
  const m = new Map(), suyaDe = new Map();
  for (const it of items) if (it.guardo && it.falta) { const k = normP(it.t.persona) || '_'; suyaDe.set(k, (suyaDe.get(k) || 0) + it.falta); }
  const prestamo = new Map(), deTx = new Map(); /* préstamos hechos con plata de otros; pago → partes por deuda */
  for (const it of items) { if (it.k === 'cobrar' && it.t.de) prestamo.set(it.t.id, it); for (const a of it.abonos) (deTx.get(a.id) || deTx.set(a.id, []).get(a.id)).push({ it, v:a.amount }); }
  const guarda = new Map(items.filter(it => it.guardo).map(it => [it.t.id, it]));
  if (!guarda.size) return m;
  const per = n => { const k = normP(n) || '_'; if (!m.has(k)) m.set(k, { nombre:(n || '').trim(), suya:0, fuera:0, usado:0, acc:{} }); return m.get(k); };
  const propia = id => { const a = accById(id); return !!a && !esDeuda(a) && !isCard(a); };
  const bal = {}, held = {}; /* held[cuenta] = Map(clave → valor) */
  const H = id => held[id] || (held[id] = new Map()), totH = id => { let s = 0; for (const v of H(id).values()) s += v; return s; };
  const sacar = (id, k, v) => { const h = H(id), q = Math.min(v, h.get(k) || 0); if (q) h.set(k, (h.get(k) || 0) - q); return q; };
  /* quita v de la plata de una persona: primero en la cuenta dada, luego lo usado, luego en sus otras cuentas */
  const quitarPersona = (k, v, id) => { const p = m.get(k); if (!p) return;
    if (id) v -= sacar(id, k, v);
    const u = Math.min(v, p.usado); p.usado -= u; v -= u;
    for (const c of Object.keys(held).sort((a, b) => (held[b].get(k) || 0) - (held[a].get(k) || 0))) { if (v <= 0) break; v -= sacar(c, k, v); } };
  const tx = S.transactions.slice().sort((a, b) => a.date.localeCompare(b.date) || (a.ts || 0) - (b.ts || 0));
  for (const t of tx) {
    const a = t.amount;
    if (t.type === 'transferencia' && t.pending) continue;
    /* recibiste plata de alguien */
    if (guarda.has(t.id)) { const p = per(t.persona); bal[t.toAccountId] = (bal[t.toAccountId] || 0) + a; if (propia(t.toAccountId)) { const h = H(t.toAccountId), k = normP(p.nombre) || '_'; h.set(k, (h.get(k) || 0) + a); } continue; }
    /* devolviste su plata, o te pagaron un préstamo hecho con plata de otros */
    const partes = deTx.get(t.id);
    if (partes) {
      if (propia(t.accountId)) bal[t.accountId] = (bal[t.accountId] || 0) - a;
      if (propia(t.toAccountId)) bal[t.toAccountId] = (bal[t.toAccountId] || 0) + a;
      let resto = a;
      for (const { it, v } of partes) {
        if (it.guardo) { resto -= v; quitarPersona(normP(it.t.persona) || '_', v, t.accountId); }
        else if (prestamo.has(it.t.id) && propia(t.toAccountId)) { resto -= v; const k = normP(it.t.de); per(it.t.de); const h = H(t.toAccountId); h.set(k, (h.get(k) || 0) + v); }
      }
      if (propia(t.accountId)) desborde(t.accountId, null);
      continue;
    }
    /* prestaste plata de otra persona */
    if (prestamo.has(t.id)) { bal[t.accountId] = (bal[t.accountId] || 0) - a; const k = normP(t.de); if (m.has(k)) { let v = a - sacar(t.accountId, k, a);
        for (const c of Object.keys(held)) { if (v <= 0) break; v -= sacar(c, k, v); } m.get(k).usado = Math.max(0, m.get(k).usado - v); }
      desborde(t.accountId, null); continue; }
    /* todo lo demás: entradas suman; salidas toman primero tu plata */
    const sale = t.type === 'gasto' ? t.accountId : t.type === 'transferencia' ? t.accountId : t.type === 'ajuste' && a < 0 ? t.accountId : null;
    const entra = t.type === 'ingreso' || (t.type === 'ajuste' && a > 0) ? t.accountId : t.type === 'transferencia' ? t.toAccountId : null;
    const v = Math.abs(a);
    if (sale) bal[sale] = (bal[sale] || 0) - v;
    if (entra) bal[entra] = (bal[entra] || 0) + v;
    if (sale && propia(sale)) desborde(sale, t.type === 'transferencia' && propia(t.toAccountId) ? t.toAccountId : null);
  }
  /* si en una cuenta queda menos plata que la de otros, lo que falta salió con este movimiento: va a la cuenta destino o queda como usado */
  function desborde(id, destino){
    const tot = totH(id), sobra = tot - Math.max(0, bal[id] || 0); if (sobra <= 0) return;
    for (const [k, v] of H(id)) { if (!v) continue; const q = Math.round(sobra * v / tot); H(id).set(k, v - q);
      if (destino) { const h = H(destino); h.set(k, (h.get(k) || 0) + q); } else if (m.has(k)) m.get(k).usado += q; }
  }
  /* cuadre final con lo que dice Personas: nunca se pierde ni se inventa plata de otros */
  for (const [k, p] of m) {
    p.suya = suyaDe.get(k) || 0;
    p.fuera = Math.min(p.suya, items.filter(it => it.k === 'cobrar' && it.t.de && normP(it.t.de) === k).reduce((s, it) => s + it.falta, 0));
    for (const id in held) { const v = held[id].get(k) || 0; if (v > 0) p.acc[id] = v; }
    let enCuentas = Object.values(p.acc).reduce((s, v) => s + v, 0), dif = enCuentas + p.fuera + p.usado - p.suya;
    if (dif > 0) { const u = Math.min(dif, p.usado); p.usado -= u; dif -= u;
      for (const id of Object.keys(p.acc).sort((a, b) => p.acc[a] - p.acc[b])) { if (dif <= 0) break; const q = Math.min(dif, p.acc[id]); p.acc[id] -= q; dif -= q; if (!p.acc[id]) delete p.acc[id]; } }
    else if (dif < 0) p.usado += -dif;
    if (!p.suya && !p.fuera) m.delete(k);
  }
  if (DCACHE) DCACHE.aj = m;
  return m;
}
/* lo prestado con plata de otros y aún sin cobrar: no es tuyo, así que no sale de tu disponible */
const prestadoAjeno = () => { let s = 0; for (const x of ajenaPersonas().values()) s += x.fuera; return s; };
/* plata de otras personas que está dentro de cada cuenta: { id: { v, quien:[nombres] } } */
function ajenaPorCuenta(){
  const m = {};
  for (const p of ajenaPersonas().values()) for (const id in p.acc) { if (!p.acc[id]) continue;
    const x = m[id] = m[id] || { v:0, quien:[] }; x.v += p.acc[id]; if (p.nombre && !x.quien.some(q => normP(q) === normP(p.nombre))) x.quien.push(p.nombre); }
  return m;
}
/* totales de la plata de otros: suya = cuentas + prestada + usada (lo mismo que suma Personas) */
function ajenaTotales(){
  const r = { suya:0, cuentas:0, fuera:0, usado:0 };
  for (const p of ajenaPersonas().values()) { r.suya += p.suya; r.fuera += p.fuera; r.usado += p.usado; for (const id in p.acc) r.cuentas += p.acc[id]; }
  return r;
}
/* cuánto de la plata de una persona puedes prestar (lo suyo que está en tus cuentas), y en qué cuenta está más */
function ajenaLibre(nombre){
  const x = ajenaPersonas().get(normP(nombre)); if (!x) return { v:0, acc:null };
  const ids = Object.keys(x.acc).filter(id => x.acc[id] > 0).sort((a, b) => x.acc[b] - x.acc[a]);
  return { v:ids.reduce((s, id) => s + x.acc[id], 0), acc:ids[0] || null };
}
const deudaConcepto = t => t.note || (t.type === 'gasto' ? catPath(t.categoryId) : t.type === 'ajuste' ? 'Deuda' : 'Préstamo');
/* el comentario que Caudal pone solo ya nombra a la persona: no se repite */
const deudaAuto = t => !!(t.persona && t.note && normP(t.note).includes(normP(t.persona)));
const deudaNombre = t => t.persona ? t.persona + (t.note && !deudaAuto(t) ? ' · ' + t.note : '') : deudaConcepto(t);
/* comentario automático, el mismo en las dos direcciones: "Pago Laura" (la flecha del movimiento dice si entró o salió) */
function deudaPagoNota(it){
  const n = (it.t.persona || '').trim(), c = deudaAuto(it.t) ? '' : it.t.note || '';
  return n ? 'Pago ' + n : 'Pago ' + (c || (it.k === 'cobrar' ? 'préstamo' : it.guardo ? 'devolución' : 'deuda'));
}
/* comentario de una deuda nueva sin concepto escrito */
const deudaNuevaNota = (tipo, n, de) => tipo === 'debo' ? 'Deuda ' + n : tipo === 'guardo' ? 'Plata de ' + n : 'Préstamo ' + n + (de ? ' (plata de ' + de + ')' : '');
/* mantenimiento de los pagos guardados antes, una sola vez y sin cambiar ningún valor:
   1. comentarios viejos ("Te pagaron: Laura", "Pago de Laura", "Devolución a Laura"…) → "Pago Laura".
   2. un pago por persona que quedó partido en varios movimientos (mismo momento, persona, cuentas y tipo) → un solo movimiento
      con la suma; Caudal lo reparte igual que antes, de la deuda más vieja a la más nueva. */
function deudaNotasViejas(){
  let cambio = false;
  const viejo = /^(Devolución a |Pago de deuda: |Te pagaron: |Devolución: |Pago a |Pago de )/;
  const por = new Map(deudasTodas().map(it => [it.t.id, it]));
  for (const x of S.transactions) {
    if (x.src !== 'deuda' || !viejo.test(x.note || '')) continue;
    const it = x.auto && x.auto[0] !== '*' ? por.get(x.auto) : null, n = (x.persona || (it && it.t.persona) || '').trim();
    const nueva = n ? 'Pago ' + n : it ? deudaPagoNota(it) : null; if (nueva && nueva !== x.note) { x.note = nueva; cambio = true; }
  }
  const grupos = new Map();
  for (const x of S.transactions) {
    const it = x.type === 'transferencia' && x.src === 'deuda' && x.persona && x.auto && x.auto[0] !== '*' ? por.get(x.auto) : null; if (!it) continue;
    const g = [normP(x.persona), x.date, x.accountId, x.toAccountId, deudaClase(it)].join('|');
    (grupos.get(g) || grupos.set(g, []).get(g)).push(x);
  }
  for (const [g, l] of grupos) {
    if (l.length < 2) continue;
    l.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    /* solo los creados juntos por el botón de pago por persona (milisegundos seguidos) */
    const bloques = []; for (const x of l) { const u = bloques[bloques.length - 1]; if (u && (x.ts || 0) - (u[u.length - 1].ts || 0) <= 50) u.push(x); else bloques.push([x]); }
    for (const b of bloques) { if (b.length < 2) continue;
      const [primero, ...resto] = b, clase = g.split('|')[4], quitar = new Set(resto.map(x => x.id));
      primero.amount = b.reduce((s, x) => s + x.amount, 0); primero.auto = '*' + clase; primero.note = 'Pago ' + primero.persona.trim();
      S.transactions = S.transactions.filter(x => !quitar.has(x.id)); cambio = true; }
  }
  return cambio;
}
/* qué dice cada fila según el caso */
const deudaVerbo = it => it.k === 'cobrar' ? 'Te debe' : it.guardo ? 'Es suya, la tienes tú' : it.k === 'pausa' ? 'Le debes · en pausa' : 'Le debes';
const deudaBoton = it => it.k === 'cobrar' ? 'Me pagó' : it.guardo ? 'Devolver' : 'Pagar';

/* ----- un préstamo descuenta del presupuesto del rubro de donde salió (su categoryId apunta al rubro).
   Si te pagan dentro del mismo periodo, el rubro recupera lo que te devolvieron. ----- */
const esPrestamo = t => t.type === 'transferencia' && t.src !== 'deuda' && esDeuda(accById(t.toAccountId)) && accById(t.toAccountId).debt === 'cobrar';
function prestamoEnPeriodo(t, p){
  if (!t.categoryId || !esPrestamo(t) || !inP(t, p)) return 0;
  const it = deudaItem(t.id), devuelto = it ? it.abonos.filter(x => inP(x, p)).reduce((a, x) => a + x.amount, 0) : 0;
  return Math.max(0, t.amount - devuelto);
}
/* cuánto cuenta un movimiento en el rubro que le corresponde: gastos (salvo los pagados con Excedentes) y préstamos */
function enRubro(t, pl, p){
  if (t.type === 'gasto') return pagaExc(t, pl, p) ? 0 : t.amount;
  return prestamoEnPeriodo(t, p);
}

/* filas de deudas abiertas con su botón de pago (Cuentas e Inicio) */
const deudaFilas = ab => '<div>' + ab.map(it => { const { t, falta, pagado, monto } = it;
  return '<div class="set deuda"><button class="t" data-dver="' + esc(t.id) + '"><b>' + esc(deudaNombre(t)) + '</b><span>' + deudaVerbo(it) + ' · ' + fmtShort(parseISO(t.date)) + (pagado ? ' · abonado ' + money(pagado) + ' de ' + money(monto) : '') + '</span></button>' +
  '<span class="num">' + money(falta) + '</span><button class="pill solid" data-dpay="' + esc(t.id) + '">' + deudaBoton(it) + '</button></div>'; }).join('') + '</div>';

/* personas ya usadas, de la más reciente a la más vieja, para elegirlas con un toque */
const personasUsadas = () => { const v = new Map(); for (const t of S.transactions.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))) if (t.persona) { const k = t.persona.trim().toLowerCase(); if (!v.has(k)) v.set(k, t.persona.trim()); } return [...v.values()].slice(0, 8); };

/* ----- tarjeta en Inicio, encima del saldo: revisar deudas antes del cierre del periodo.
   Sale siempre que haya deudas abiertas; sin deudas, solo en los últimos 5 días como confirmación. ----- */
function deudasInicio(p){
  if (!deudaAcc('pagar') && !deudaAcc('cobrar') && !deudaAcc('pausa')) return '';
  const ab = deudasAbiertas(), today = iso(new Date());
  const faltan = today >= p.s && today <= p.e ? Math.round((parseISO(p.e) - parseISO(today)) / 864e5) + 1 : null, cierre = faltan !== null && faltan <= 5;
  if (!ab.length) return cierre ? '<div class="banner"><span><b>Sin deudas abiertas.</b> Llegas al cierre del periodo sin deber ni que te deban.</span></div>' : '';
  const debes = ab.filter(x => x.k !== 'cobrar').reduce((a, x) => a + x.falta, 0), teDeben = ab.filter(x => x.k === 'cobrar').reduce((a, x) => a + x.falta, 0);
  return '<section class="card"><div class="card-h"><h2>Revisa tus deudas</h2><span class="aside">' + (cierre ? '<b class="warn">' + (faltan === 1 ? 'Hoy cierra el periodo' : 'Faltan ' + faltan + ' días para el cierre') + '</b>' : ab.length + (ab.length === 1 ? ' abierta' : ' abiertas')) + '</span></div>' +
    '<div class="stats3 two-col"><div><span>Debes</span><b class="num' + (debes ? ' neg' : '') + '">' + money(debes) + '</b></div><div><span>Te deben</span><b class="num">' + money(teDeben) + '</b></div></div>' +
    '<p class="note" style="padding:0">' + (cierre ? 'Págalas o cóbralas antes del cierre para que el sobrante del periodo sea real.' : 'La plata de otros ya está descontada de tu disponible; las deudas en pausa no, hasta que las pagues.') + '</p>' +
    '<button class="btn ghost block" data-go="personas">Ver por persona y registrar abonos</button></section>';
}

/* ----- hoja de Por pagar o Por cobrar: cada concepto por separado, con su propio pago ----- */
function deudaCuentaSheet(k){
  const pagar = k !== 'cobrar', todas = deudasTodas().filter(x => x.k === k), ab = todas.filter(x => x.falta), sal = todas.filter(x => !x.falta).reverse();
  const h = '<div class="sheet-h"><b id="sheet-title">' + DEUDA[k].name + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + (pagar ? 'Debes en total' : 'Te deben en total') + '</span><div class="tile-v num">' + money(ab.reduce((a, x) => a + x.falta, 0)) + '</div>' +
    '<span class="tile-s">' + (ab.length ? ab.length + (ab.length === 1 ? ' concepto abierto' : ' conceptos abiertos') + '. Cada uno se ' + (pagar ? 'paga' : 'cobra') + ' por separado, completo o por abonos.' : 'No hay conceptos abiertos.') + '</span></section>' +
    (ab.length ? deudaFilas(ab) : '') +
    (sal.length ? '<div class="pgroup">Saldadas<span class="num">' + sal.length + '</span></div><div>' + sal.slice(0, 10).map(({ t }) => '<div class="set deuda"><button class="t" data-dver="' + esc(t.id) + '"><b>' + esc(deudaNombre(t)) + '</b><span>' + money(Math.abs(t.amount)) + ' · ' + fmtShort(parseISO(t.date)) + '</span></button><span class="pos">✓</span></div>').join('') + '</div>' : '') +
    '<button class="btn ghost block" data-dnueva="' + k + '">+ Nueva deuda</button></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* ----- detalle de una deuda: concepto, abonos con fecha y cuenta, y lo que falta ----- */
function deudaVerSheet(id){
  const it = deudasTodas().find(x => x.t.id === id); if (!it) return;
  const { t, k, abonos, pagado, falta, monto } = it, pagar = k !== 'cobrar';
  const h = '<div class="sheet-h"><b id="sheet-title">' + esc(deudaNombre(t)) + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + (falta ? (pagar ? 'Te falta pagar' : 'Te falta recibir') : 'Saldada ✓') + '</span><div class="tile-v num">' + money(falta || monto) + '</div>' +
    '<span class="tile-s">' + (it.guardo ? 'Plata de otra persona' : pagar ? 'Deuda' : 'Préstamo' + (t.de ? ' con plata de ' + esc(t.de) + ',' : '')) + ' de ' + money(monto) + ' del ' + fmtShort(parseISO(t.date)) + (pagado ? ' · abonado ' + money(pagado) : '') + '</span></section>' +
    '<div><span class="label">Abonos</span>' + (abonos.length ? abonos.map(x => '<div class="set"><div class="t"><b class="num">' + money(x.amount) + '</b><span>' + fmtShort(parseISO(x.date)) + ' · ' + (pagar ? 'desde ' : 'a ') + esc(accShort(pagar ? x.accountId : x.toAccountId)) + '</span></div><button class="pill" data-tx="' + esc(x.id) + '">Editar</button></div>').join('') : '<p class="note" style="padding:0">Aún no hay abonos.</p>') + '</div>' +
    (falta ? '<button class="btn accent block" data-dpay="' + esc(t.id) + '">' + (it.guardo ? 'Registrar que se la devolviste' : pagar ? 'Registrar un pago' : 'Registrar lo que te pagaron') + '</button>' : '') +
    '<p class="note" style="padding:0">Puedes pagar el total o abonar por partes; cada abono queda aquí con su fecha.</p></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}

/* ----- pagar una deuda o registrar que te pagaron (también pagos parciales) ----- */
let DP = null;
function deudaPagarSheet(id){
  const it = deudasAbiertas().find(x => x.t.id === id); if (!it) return toast('Esa deuda ya está saldada');
  const pl = planFor(period(0)), pref = (pl && pl.from) || lastAccount();
  DP = { it, acc:accById(pref) && !esDeuda(accById(pref)) ? pref : null };
  deudaPagarDraw();
}
function deudaPagarDraw(){
  const { it, acc } = DP, pagar = it.k !== 'cobrar';
  const b = balances(), aj = ajenaPorCuenta(b), opts = cuentasElegibles(b, acc).filter(a => !isCard(a));
  const h = '<div class="sheet-h"><b id="sheet-title">' + (it.guardo ? 'Devolver su plata' : pagar ? 'Pagar deuda' : 'Te pagaron') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form dpay">' +
    '<section class="card glow" style="padding:16px"><span class="label">' + esc(deudaNombre(it.t)) + '</span><div class="tile-v num">' + money(it.falta) + '</div><span class="tile-s">' + (it.guardo ? 'Te falta devolver' : pagar ? 'Te falta pagar' : 'Te falta recibir') + (it.pagado ? ' · ya van ' + money(it.pagado) + ' de ' + money(it.monto) : '') + '</span></section>' + (it.t.de ? '<p class="note" style="padding:0;margin:0">Era plata de ' + esc(it.t.de) + ': lo que te pague vuelve a quedar como suya en la cuenta donde llegue.</p>' : '') +
    '<div class="field"><label class="label" for="dp-amt">Valor</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="dp-amt" inputmode="numeric" class="num" value="' + nf.format(it.falta) + '" style="font-size:28px"></div></div>' +
    '<div class="field"><span class="label">' + (pagar ? 'Sale de' : 'Llega a') + '</span><div class="cgrid">' + opts.map(a => cuentaTile(a, 'data-dpacc="' + esc(a.id) + '"', acc === a.id, b, aj)).join('') + '</div></div>' +
    '<div class="err" id="dp-err"></div><button class="btn accent block" type="button" data-dpgo>Registrar</button></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.dpay) { e.stopPropagation(); return deudaPagarSheet(d.dpay); }
  if (d.dver) { e.stopPropagation(); return deudaVerSheet(d.dver); }
  if (d.dsal !== undefined) { e.stopPropagation(); ui.dsal = !ui.dsal; return render(); }
  if (!DP || !el.closest('.dpay')) return;
  if (d.dpacc) { e.stopPropagation(); const v = $('#dp-amt').value; DP.acc = d.dpacc; deudaPagarDraw(); $('#dp-amt').value = v; return; }
  if (d.dpgo !== undefined) { e.stopPropagation();
    const v = leerPesos($('#dp-amt').value), { it } = DP, err = m => { $('#dp-err').textContent = m; };
    if (!v) return err('Escribe el valor.'); if (v > it.falta) return err('Es más de lo que falta (' + money(it.falta) + ').'); if (!DP.acc) return err('Elige la cuenta.');
    const D = deudaAcc(it.k), pagar = it.k !== 'cobrar';
    S.transactions.push({ id:uid(), type:'transferencia', amount:v, date:iso(new Date()), ts:Date.now(), accountId:pagar ? DP.acc : D.id, toAccountId:pagar ? D.id : DP.acc,
      note:deudaPagoNota(it), src:'deuda', auto:it.t.id, ...(it.t.persona ? { persona:it.t.persona } : {}) });
    sortTx(S); save(); DP = null; closeSheet(); render(); dpVolver();
    return toast(v === it.falta ? (it.guardo ? 'Plata devuelta' : pagar ? 'Deuda pagada' : 'Préstamo saldado') : 'Abono registrado · faltan ' + money(it.falta - v)); }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'dp-amt') pesosCampo(e.target); });

/* en el formulario de préstamo: de qué presupuesto sale (se guarda como la categoría del rubro) */
function deudaRubro(){
  const pl = planFor(periodFor(F.date || iso(new Date()))); if (!pl) return '';
  const its = pl.items.filter(i => isGastoItem(i) && !isFijo(i)); if (!its.length) return '';
  const sel = F.parent ? itemOfCat(pl, F.sub || F.parent) : null;
  return '<div class="field"><span class="label">¿De qué presupuesto sale?</span><div class="chips">' +
    its.map(i => '<button type="button" class="chip" data-frub="' + esc(i.id) + '" aria-pressed="' + (sel === i) + '">' + esc(i.name) + '</button>').join('') +
    '<button type="button" class="chip" data-frub="" aria-pressed="' + (!!F.rubNo) + '">Ninguno</button></div>' +
    '<span class="tile-s">Mientras esté prestado, lo descuenta de ese presupuesto. Si te pagan en este mismo periodo, lo recupera.</span></div>';
}
/* último rubro usado en un préstamo, para proponerlo de una vez */
const ultimoRubroPrestamo = () => { const t = S.transactions.find(x => esPrestamo(x) && x.categoryId); return t ? t.categoryId : null; };
document.addEventListener('click', e => {
  const el = e.target.closest('[data-frub]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  const pl = planFor(periodFor(F.date || iso(new Date()))), it = pl && pl.items.find(i => i.id === el.dataset.frub);
  F.parent = it ? it.cats[0] : null; F.sub = null; F.rubNo = !it; drawForm();
}, true);

/* ----- en el formulario: "Lo pagó otra persona" (gasto) y "Es un préstamo" (transferencia) ----- */
function deudaToggle(){
  if (F.type === 'gasto') { const on = esDeuda(accById(F.accountId));
    return '<button type="button" class="pill pendt" data-fdeuda aria-pressed="' + on + '">' + (on ? '🤝 Lo pagó otra persona: queda en Por pagar' : '🤝 ¿Lo pagó otra persona? Regístralo como deuda') + '</button>'; }
  if (F.type === 'transferencia') { const on = esDeuda(accById(F.toAccountId));
    return '<button type="button" class="pill pendt" data-fdeuda aria-pressed="' + on + '">' + (on ? '🤝 Es un préstamo: queda en Por cobrar' : '🤝 ¿Es un préstamo? Regístralo para que te paguen') + '</button>'; }
  return '';
}
const deudaNota = () => '<p class="note" style="padding:0;margin:0">' + (F.type === 'gasto'
  ? 'Cuenta en tu presupuesto desde hoy y resta de tu disponible. Cuando le pases la plata, págala en Personas.'
  : 'Sale de tu cuenta y no cuenta en tu disponible. Cuando te devuelvan, márcalo en Personas.') + '</p>' + deudaPersonaField();
document.addEventListener('click', e => {
  const el = e.target.closest('[data-fdeuda]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  if (F.type === 'gasto') {
    if (esDeuda(accById(F.accountId))) F.accountId = F.prevAcc || lastAccount();
    else { F.prevAcc = F.accountId; F.accountId = deudaCrear('pagar').id; F.fund = null; F.excPct = 0; }
  } else if (F.type === 'transferencia') {
    const on = !esDeuda(accById(F.toAccountId));
    F.toAccountId = on ? deudaCrear('cobrar').id : null; F.parent = on ? ultimoRubroPrestamo() : null; F.sub = null; F.rubNo = false;
  }
  drawForm();
}, true);

/* ----- parte de otra persona: pagaste el total, pero una parte era de alguien más ----- 
   El gasto queda solo con tu parte. La parte ajena sale de la misma cuenta hacia Por cobrar, sin categoría,
   así nunca toca tu presupuesto; si ya te la devolvieron, el cobro se registra de una vez y queda saldada.
   Se reconoce por src 'ajena' y el mismo grp del gasto. F.ajena = { on, monto, devuelto, acc, id, pagoId, abonos } */
const ajenaMonto = () => F && F.ajena && F.ajena.on ? F.ajena.monto || 0 : 0;
/* dónde suele llegar lo que te devuelven: al bolsillo que paga la tarjeta, o a la misma cuenta del gasto */
const ajenaCuentaPago = accId => { const c = cardOf(accId); return c ? cardPocket(c) : esDeuda(accById(accId)) ? null : accId; };
function ponTx(x){ const j = S.transactions.findIndex(y => y.id === x.id); if (j >= 0) S.transactions[j] = x; else S.transactions.push(x); }
/* guarda la parte ajena de un gasto ya armado (t trae su grp). Con a.on falso borra la que hubiera. */
function ajenaGuardar(t, a, keep){
  const pagosDe = id => S.transactions.filter(y => y.type === 'transferencia' && y.src === 'deuda' && y.auto === id);
  if (!a || !a.on || !a.monto) { if (a && a.id) { const quitar = new Set(pagosDe(a.id).map(y => y.id)); S.transactions = S.transactions.filter(y => !quitar.has(y.id)); } return; }
  const x = { id:a.id || uid(), type:'transferencia', amount:a.monto, date:t.date, ts:t.ts, accountId:t.accountId, toAccountId:deudaCrear('cobrar').id,
    note:'Parte de otra persona' + (t.note ? ': ' + t.note : ''), src:'ajena', grp:t.grp };
  ponTx(x); if (keep) keep.add(x.id);
  if (a.abonos) return; /* con abonos parciales el cobro se maneja en Personas */
  if (a.devuelto && a.acc) ponTx({ id:a.pagoId || uid(), type:'transferencia', amount:a.monto, date:t.date, ts:t.ts + 1, accountId:x.toAccountId, toAccountId:a.acc, note:'Te pagaron: ' + x.note, src:'deuda', auto:x.id });
  else if (a.pagoId) S.transactions = S.transactions.filter(y => y.id !== a.pagoId);
}
/* al abrir un gasto guardado: suma la parte ajena al total y recupera si ya te la devolvieron */
function ajenaCargar(t){
  const x = t.grp && S.transactions.find(y => y.grp === t.grp && y.src === 'ajena'); if (!x) return;
  const pagos = S.transactions.filter(y => y.type === 'transferencia' && y.src === 'deuda' && y.auto === x.id), uno = pagos.length === 1 && pagos[0].amount === x.amount ? pagos[0] : null;
  F.ajena = { on:true, monto:x.amount, id:x.id, devuelto:!!uno, acc:uno ? uno.toAccountId : null, pagoId:uno ? uno.id : null, abonos:uno ? 0 : pagos.reduce((s, y) => s + y.amount, 0) };
  F.amount += x.amount;
}
function ajenaNota(total){
  const a = F.ajena, mio = total - (a.monto || 0);
  if (!a.monto) return 'Escribe cuánto era de la otra persona.';
  if (mio <= 0) return '<b class="neg">La parte de la otra persona no puede ser todo el gasto.</b> Si todo era suyo, regístralo como transferencia con "¿Es un préstamo?".';
  return 'Tu gasto: <b>' + money(mio) + '</b>. ' + (a.devuelto ? 'Los ' + money(a.monto) + ' quedan cobrados de una vez.' : 'Los ' + money(a.monto) + ' quedan en Por cobrar hasta que te los devuelva.') + ' No tocan tu presupuesto.';
}
function ajenaField(){
  const a = F.ajena;
  if (!a || !a.on) return '<button type="button" class="pill pendt" data-faj="on" aria-pressed="false">🤝 ¿Una parte es de otra persona?</button>';
  const opts = S.accounts.filter(x => !x.hidden && !esDeuda(x) && !isCard(x));
  return '<div class="field"><button type="button" class="pill pendt" data-faj="on" aria-pressed="true">🤝 Una parte es de otra persona</button>' +
    '<label class="label" for="f-aj">Parte de la otra persona</label><input id="f-aj" class="inp num" inputmode="numeric" autocomplete="off" placeholder="$ 0" value="' + (a.monto ? nf.format(a.monto) : '') + '">' +
    '<p class="note" id="f-ajn" style="padding:0;margin:0">' + ajenaNota(Math.abs(F.amount)) + '</p>' +
    (a.abonos ? '<p class="note" style="padding:0;margin:0">Ya te abonó ' + money(a.abonos) + '; lo que falta se cobra en Personas.</p>'
      : '<button type="button" class="pill pendt" data-faj="dev" aria-pressed="' + !!a.devuelto + '">' + (a.devuelto ? '✓ Ya te lo devolvió' : '¿Ya te lo devolvió?') + '</button>' +
        (a.devuelto ? '<span class="label">Te llegó a</span><div class="cgrid">' + opts.map(x => '<button type="button" class="ctile sm" data-faja="' + esc(x.id) + '" aria-pressed="' + (a.acc === x.id) + '"><span class="nm">' + esc(accShort(x.id)) + '</span></button>').join('') + '</div>' : '')) + '</div>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-faj],[data-faja]'); if (!el || !F) return; e.stopPropagation(); syncForm();
  const a = F.ajena = F.ajena || { on:false, monto:0 };
  if (el.dataset.faja) a.acc = el.dataset.faja;
  else if (el.dataset.faj === 'on') a.on = !a.on;
  else { a.devuelto = !a.devuelto; if (a.devuelto && !a.acc) a.acc = ajenaCuentaPago(F.accountId); }
  drawForm(); if (a.on && !a.monto) setTimeout(() => { const i = $('#f-aj'); if (i) i.focus(); }, 50);
}, true);
document.addEventListener('input', e => {
  if (e.target.id !== 'f-aj' && e.target.id !== 'f-amt') return; const box = $('#f-ajn'); if (!box) return;
  if (e.target.id === 'f-aj') pesosCampo(e.target);
  F.ajena.monto = leerPesos($('#f-aj').value); box.innerHTML = ajenaNota(leerPesos($('#f-amt').value)); fbudRefrescar();
});

/* ----- nueva deuda con persona: los tres casos de Personas › + Nuevo -----
   debo:   le debes a alguien y esa plata no está en tus cuentas: queda en pausa (no resta del disponible).
   guardo: tienes plata de otra persona en una de tus cuentas: está ahí, pero no es tuya (resta del disponible).
   preste: le prestaste a alguien: sale de tu cuenta y queda por cobrar. */
const DN_TIPOS = [
  ['debo', 'Le debo a alguien', 'La plata no está en tus cuentas. Queda en pausa y no resta de tu disponible hasta que la pagues.'],
  ['guardo', 'Tengo plata de alguien', 'Está en una de tus cuentas, pero es de otra persona: no cuenta como tuya hasta que se la devuelvas.'],
  ['preste', 'Le presté a alguien', 'Sale de tu cuenta y queda por cobrar. No suma a tu disponible hasta que te pague.']
];
let DN = null;
/* lo que ya registraste con personas, para repetirlo con un toque (el valor queda listo para cambiarlo): lo más reciente de cada tipo y persona */
function deudaRepetir(){
  const P = deudaAcc('pagar'), C = deudaAcc('cobrar'), Z = deudaAcc('pausa'), vistos = new Set(), r = [];
  for (const t of S.transactions.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))) {
    if (!t.persona || t.src === 'deuda' || t.lig) continue;
    const tipo = Z && t.type === 'ajuste' && t.accountId === Z.id && t.amount < 0 ? 'debo' : P && t.type === 'transferencia' && t.accountId === P.id ? 'guardo' : C && t.type === 'transferencia' && t.toAccountId === C.id ? 'preste' : null;
    if (!tipo) continue; const k = tipo + '|' + normP(t.persona); if (vistos.has(k)) continue; vistos.add(k);
    r.push({ tipo, persona:t.persona.trim(), amt:Math.abs(t.amount), acc:tipo === 'guardo' ? t.toAccountId : tipo === 'preste' ? t.accountId : null, de:t.de || '' });
  }
  return r.slice(0, 6);
}
const DN_CORTO = { debo:'le debo', guardo:'plata suya', preste:'le presté' };
function deudaNuevaSheet(k){
  DN = { tipo:k === 'cobrar' ? 'preste' : k === 'pausa' ? 'debo' : k === 'pagar' ? 'guardo' : 'debo', persona:'', note:'', acc:lastAccount(), de:'', rep:deudaRepetir() };
  deudaNuevaDraw();
}
function deudaNuevaDraw(){
  const [, , ayuda] = DN_TIPOS.find(x => x[0] === DN.tipo), cuenta = DN.tipo !== 'debo';
  const b = balances(), aj = ajenaPorCuenta(b), opts = cuentasElegibles(b, DN.acc).filter(a => !isCard(a)), gente = personasUsadas();
  const h = '<div class="sheet-h"><b id="sheet-title">Nueva deuda</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form dnueva">' +
    (DN.rep.length ? '<div class="field"><span class="label">Repetir uno anterior · cambia el valor si hace falta</span><div class="pills">' + DN.rep.map((q, i) => '<button type="button" class="pill" data-dnrep="' + i + '">' + esc(q.persona) + ' · ' + DN_CORTO[q.tipo] + ' · ' + short(q.amt) + '</button>').join('') + '</div></div>' : '') +
    '<div class="field"><span class="label">¿Qué pasó?</span><div class="chips">' + DN_TIPOS.map(([id, t]) => '<button type="button" class="chip" data-dntipo="' + id + '" aria-pressed="' + (DN.tipo === id) + '">' + t + '</button>').join('') + '</div><span class="tile-s">' + ayuda + '</span></div>' +
    '<div class="field"><label class="label" for="dn-persona">¿Con quién?</label><input class="inp" id="dn-persona" value="' + esc(DN.persona) + '" placeholder="Nombre de la persona" autocomplete="off"><span class="tile-s" id="dn-sum">' + dnSuma() + '</span>' +
      (gente.length ? '<div class="chips" style="margin-top:8px">' + gente.map(g => '<button type="button" class="chip" data-dnper="' + esc(g) + '" aria-pressed="' + (DN.persona.toLowerCase() === g.toLowerCase()) + '">' + esc(g) + '</button>').join('') + '</div>' : '') + '</div>' +
    '<div class="field"><label class="label" for="dn-amt">Valor</label><div class="amount" style="padding:10px 16px"><span>$</span><input id="dn-amt" inputmode="numeric" class="num" value="' + (DN.amt ? nf.format(DN.amt) : '') + '" placeholder="0" style="font-size:28px"></div></div>' +
    dnDeField() +
    (cuenta ? '<div class="field"><span class="label">' + (DN.tipo === 'guardo' ? '¿En qué cuenta está?' : '¿De qué cuenta salió?') + '</span><div class="cgrid">' + opts.map(a => cuentaTile(a, 'data-dnacc="' + esc(a.id) + '"', DN.acc === a.id, b, aj)).join('') + '</div></div>' : '') +
    '<div class="field"><label class="label" for="dn-note">Concepto (opcional)</label><input class="inp" id="dn-note" value="' + esc(DN.note) + '" placeholder="' + (DN.persona ? deudaNuevaNota(DN.tipo, DN.persona, DN.tipo === 'preste' && DN.de) : DN.tipo === 'guardo' ? 'Ej. Para la cuota de la moto' : 'Ej. Préstamo de diciembre') + '" autocomplete="off"><span class="tile-s">Si lo dejas vacío, Caudal lo escribe solo.</span></div>' +
    '<div class="err" id="dn-err"></div><button class="btn accent block" type="button" data-dngo>Guardar</button></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
/* lo escrito en los campos sobrevive a redibujar la hoja al elegir otra opción */
const dnLeer = () => { const p = $('#dn-persona'), n = $('#dn-note'), a = $('#dn-amt'); if (p) DN.persona = p.value.trim(); if (n) DN.note = n.value.trim(); if (a) DN.amt = leerPesos(a.value); };
/* crea el movimiento de una deuda nueva (lo usan la hoja de Personas y el registro por voz): devuelve { err } o { msg } y no guarda ni dibuja */
function deudaNuevaAplicar(o){
  if (!o.persona) return { err:'Escribe con quién es la deuda.' };
  if (!o.amt) return { err:'Escribe el valor.' };
  if (o.tipo !== 'debo' && !accById(o.acc)) return { err:'Elige la cuenta.' };
  const persona = personaCanon(o.persona); /* misma persona, mismo nombre: así todo se suma en una sola fila */
  const de = o.tipo === 'preste' && o.de ? personaCanon(o.de) : '';
  if (de) { const l = ajenaLibre(de).v;
    if (normP(de) === normP(persona)) return { err:'Si es plata de ' + de + ', usa Devolverle su plata en su hoja.' };
    if (o.amt > l) return { err:'De ' + de + ' solo tienes ' + money(l) + ' sin prestar. Presta eso de su plata y el resto como tuyo, en otro registro.' }; }
  const base = { id:uid(), amount:o.amt, date:o.date || iso(new Date()), ts:Date.now(), note:o.note || deudaNuevaNota(o.tipo, persona, de), persona, ...(de ? { de } : {}) };
  if (o.tipo === 'debo') S.transactions.push({ ...base, type:'ajuste', amount:-o.amt, accountId:deudaCrear('pausa').id, src:'deuda-nueva' });
  else if (o.tipo === 'guardo') S.transactions.push({ ...base, type:'transferencia', accountId:deudaCrear('pagar').id, toAccountId:o.acc });
  else S.transactions.push({ ...base, type:'transferencia', accountId:o.acc, toAccountId:deudaCrear('cobrar').id });
  return { msg:o.tipo === 'debo' ? 'Deuda en pausa con ' + persona : o.tipo === 'guardo' ? 'Plata de ' + persona + ' apartada' : 'Préstamo a ' + persona + (de ? ' con plata de ' + de : '') + ' registrado' };
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.dnueva !== undefined) { e.stopPropagation(); return deudaNuevaSheet(d.dnueva); }
  if (!DN || !el.closest('.dnueva')) return;
  e.stopPropagation(); dnLeer();
  if (d.dntipo) { DN.tipo = d.dntipo; return deudaNuevaDraw(); }
  if (d.dnrep !== undefined) { const q = DN.rep[+d.dnrep]; if (!q) return; DN.tipo = q.tipo; DN.persona = q.persona; DN.amt = q.amt; DN.de = q.tipo === 'preste' ? q.de : ''; if (q.acc && accById(q.acc)) DN.acc = q.acc; deudaNuevaDraw(); return setTimeout(() => { const i = $('#dn-amt'); if (i) { i.focus(); try { i.select(); } catch (_) {} } }, 60); }
  if (d.dnper) { DN.persona = d.dnper; return deudaNuevaDraw(); }
  if (d.dnacc) { DN.acc = d.dnacc; return deudaNuevaDraw(); }
  if (d.dnde !== undefined) { DN.de = d.dnde; if (DN.de) { const l = ajenaLibre(DN.de); if (l.acc) DN.acc = l.acc; } return deudaNuevaDraw(); }
  if (d.dngo !== undefined) {
    const r = deudaNuevaAplicar(DN); if (r.err) { $('#dn-err').textContent = r.err; return; }
    sortTx(S); save(); DN = null; closeSheet(); render(); return toast(r.msg);
  }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'dn-amt') pesosCampo(e.target);
  if ((e.target.id === 'dn-amt' || e.target.id === 'dn-persona') && DN) { dnLeer(); const x = $('#dn-sum'); if (x) x.innerHTML = dnSuma(); } });
/* al prestar: ¿la plata es tuya o de alguien de quien tienes plata? Solo sale si tienes plata de alguien sin prestar */
function dnDeField(){
  if (DN.tipo !== 'preste') return '';
  const libre = x => Object.values(x.acc).reduce((s, v) => s + v, 0);
  const gente = [...ajenaPersonas().values()].filter(x => x.nombre && libre(x) > 0 && normP(x.nombre) !== normP(DN.persona));
  if (!gente.length) { DN.de = ''; return ''; }
  if (DN.de && !gente.some(x => normP(x.nombre) === normP(DN.de))) DN.de = '';
  return '<div class="field"><span class="label">¿De quién es la plata que prestas?</span><div class="chips">' +
    '<button type="button" class="chip" data-dnde="" aria-pressed="' + !DN.de + '">Mía</button>' +
    gente.map(x => '<button type="button" class="chip" data-dnde="' + esc(x.nombre) + '" aria-pressed="' + (normP(DN.de) === normP(x.nombre)) + '">De ' + esc(x.nombre) + ' · ' + money(libre(x)) + '</button>').join('') + '</div>' +
    '<span class="tile-s">' + (DN.de ? 'Sale de la plata de ' + esc(DN.de) + ' y no de la tuya: tu disponible no cambia. Le sigues debiendo a ' + esc(DN.de) + ' y, cuando te paguen, esa plata vuelve a ser suya.' : 'Sale de tu plata: no suma a tu disponible hasta que te paguen.') + '</span></div>';
}
/* lo que ya hay con esa persona y cómo queda al sumar esta deuda */
function dnSuma(){
  const p = DN.persona && personasLista().find(x => x.key === normP(DN.persona)); if (!p || !personaAbierta(p)) return '';
  const k = DN.tipo === 'preste' ? 'teDebe' : DN.tipo === 'guardo' ? 'suya' : 'debes', antes = p[k], v = DN.amt || 0;
  const fin = v ? { teDebe:'te deberá <b>' + money(antes + v) + '</b>', suya:'tendrás <b>' + money(antes + v) + '</b> suyos', debes:'le deberás <b>' + money(antes + v) + '</b>' }[k] : '';
  return 'Ya tienes cuentas con <b>' + esc(p.nombre) + '</b>: ' + personaResumen(p) + '.' + (v ? ' Con esto, en total ' + fin + '.' : ' Lo nuevo se suma a su total.');
}

/* ----- persona en el formulario de registro, cuando el gasto lo pagó otra persona o la transferencia es un préstamo ----- */
const deudaPersonaField = () => '<input class="inp" id="f-persona" value="' + esc(F.persona || '') + '" placeholder="¿Con quién? (opcional)" autocomplete="off" style="margin-top:8px">';
document.addEventListener('input', e => { if (e.target.id === 'f-persona' && F) F.persona = e.target.value; });
