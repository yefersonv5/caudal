/* Núcleo: utilidades de formato y fechas, estado (S y ui), guardado local y datos de ejemplo. */
const KEY = 'plata.v1';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = new Intl.NumberFormat('es-CO', {maximumFractionDigits:0});
const money = (n, sign) => (sign && n > 0 ? '+' : n < 0 ? '−' : '') + '$ ' + nf.format(Math.abs(Math.round(n)));
/* valores en pesos: se leen sin puntos y se muestran con separador de miles mientras se escriben */
const leerPesos = v => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;
const pesosCampo = el => { const v = leerPesos(el.value); el.value = v ? nf.format(v) : ''; return v; };
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now() + Math.random().toString(36).slice(2));
const MES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const DIAL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MESL = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

let storageOk = true;
let S = load();
let ui = { view:'inicio', offset:0, statsType:'gasto', open:new Set(), accFilter:null, delArm:false, resetArm:false };

function load(){
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.transactions) return s; } }
  catch(e){ storageOk = false; }
  return makeDemo();
}
function save(){
  PCACHE = null;
  billsAutoMatch();
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
  catch(e){ storageOk = false; }
  afterSave();
}

function makeDemo(){
  const s = JSON.parse(JSON.stringify(SEED));
  s.demo = true; s.transactions = []; s.budgets = {};
  const byName = n => s.categories.find(c => c.name.toLowerCase() === n.toLowerCase());
  const acc = n => (s.accounts.find(a => a.name.includes(n)) || s.accounts[0] || {}).id;
  const cash = acc('Wallet'), bank = acc('(GTC)'), save1 = acc('Ahorro general');
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const plan = [
    ['Comida', ['Almuerzo oficina','Almuerzo','Desayuno','Corrientazo'], 12000, 32000, 0.7, cash],
    ['Snacks', ['Café','Paletas oficina','Empanada'], 3000, 9000, 0.35, cash],
    ['Carne', ['Carnicería','Pollo y carne'], 35000, 70000, 0.08, bank],
    ['Marcando', ['Mercado D1','Mercado Ara','Plaza'], 60000, 180000, 0.12, bank],
    ['Gasolina', ['Tanqueo moto','Bomba Terpel'], 22000, 32000, 0.14, bank],
    ['SITP', ['Recarga TuLlave'], 10000, 20000, 0.06, cash],
    ['Uber, taxi etc', ['Uber','DiDi'], 9000, 26000, 0.05, bank],
    ['Bebida', ['Cervezas','Gaseosa'], 8000, 40000, 0.07, cash],
    ['Fundamental', ['Concentrado','Veterinaria'], 40000, 95000, 0.03, bank]
  ];
  const today = new Date(); today.setHours(12);
  const sd = s.settings.startDay || 1;
  for (let back = 0; back < 150; back++) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    const ds = iso(d);
    if (d.getDate() === sd) {
      const sal = byName('Salario'); if (sal) s.transactions.push({id:uid(), type:'ingreso', amount:4000000, date:ds, ts:+d, accountId:bank, categoryId:sal.id, note:'Nómina (ejemplo)'});
      if (save1) s.transactions.push({id:uid(), type:'transferencia', amount:600000, date:ds, ts:+d+1, accountId:bank, toAccountId:save1, note:'Ahorro del mes'});
    }
    if (d.getDate() === (sd + 3) % 28 + 1) {
      [['Luz',95000],['Agua',62000],['Internet',50000],['Gas',21000]].forEach(([n,v]) => { const c = byName(n); if (c) s.transactions.push({id:uid(), type:'gasto', amount:v + Math.round(rnd()*8)*1000, date:ds, ts:+d+2, accountId:bank, categoryId:c.id, note:'Pago ' + n.toLowerCase()}); });
      const sub = byName('Suscripciones'); if (sub) s.transactions.push({id:uid(), type:'gasto', amount:16900, date:ds, ts:+d+3, accountId:bank, categoryId:sub.id, note:'Spotify'});
    }
    for (const [n, notes, lo, hi, p, a] of plan) {
      if (rnd() < p) { const c = byName(n); if (!c) continue;
        s.transactions.push({id:uid(), type:'gasto', amount:Math.round((lo + rnd()*(hi-lo))/100)*100, date:ds, ts:+d + Math.round(rnd()*36e6), accountId:a, categoryId:c.id, note:pick(notes)}); }
    }
  }
  const setB = (n, v) => { const c = byName(n); if (c) s.budgets[c.id] = v; };
  setB('Mercado y casa', 900000); setB('Ocio', 700000); setB('Transporte', 150000); setB('Servicios', 300000); setB('Jhon', 150000); setB('Salario', 4000000);
  if (cash) s.transactions.push({id:uid(), type:'ajuste', amount:350000, date:iso(new Date(today.getTime() - 150*864e5)), ts:0, accountId:cash, note:'Saldo inicial'});
  if (save1) s.transactions.push({id:uid(), type:'ajuste', amount:2500000, date:iso(new Date(today.getTime() - 150*864e5)), ts:0, accountId:save1, note:'Saldo inicial'});
  const bill = (n, due, lead, est) => { const c = byName(n); if (c) (s.bills = s.bills || []).push({ id:uid(), name:n, categoryId:c.id, accountId:bank, dueDay:due, lead, estimate:est, cycles:{}, active:true }); };
  bill('Luz', 20, 2, 98000); bill('Agua', 16, 3, 64000); bill('Internet', 5, 2, 50000); bill('Gas', 22, 2, 23000);
  const sp = byName('Suscripciones'); if (sp) s.recurring = [{ id:uid(), name:'Spotify', amount:16900, day:14, categoryId:sp.id, accountId:bank, type:'gasto', active:true, next:(() => { const x = new Date(); const d = new Date(x.getFullYear(), x.getMonth(), 14); if (d < x) d.setMonth(d.getMonth() + 1); return iso(d); })() }];
  sortTx(s);
  return s;
}
/* listas que versiones antiguas o respaldos pueden no traer */
function completarEstado(s){ s.inbox = s.inbox || []; s.bills = s.bills || []; s.recurring = s.recurring || []; s.cardMap = s.cardMap || {}; return s; }
function sortTx(s){ s.transactions.sort((a, b) => b.date.localeCompare(a.date) || (b.ts||0) - (a.ts||0)); }
