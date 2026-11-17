/* Personas por voz y texto: en "Registrar con IA" se pueden decir cosas como "le debo 100 mil a Laura", "Pedro me dejó 50 mil",
   "le presté 200 mil a Juan", "le pagué 50 mil a Laura", "aparté 60 mil para Laura". Se entienden aquí mismo, sin internet,
   y la IA (cuando está disponible) ayuda con lo demás. Todo pasa por la hoja de revisión antes de guardar, y se guarda con
   las mismas funciones de la hoja de Personas (deudaNuevaAplicar y personaPagoAplicar), así los cálculos son los de siempre. */
const PT = { debo:'Le debo a alguien', guardo:'Tengo plata de alguien', preste:'Le presté a alguien', pago:'Le pagué lo que le debo', devolver:'Le devolví su plata', cobrar:'Me pagó lo que me debía', apartar:'Apartar para pagarle' };
const PT_K = { pago:'debes', devolver:'suya', cobrar:'teDebe', apartar:'apartar' }; /* qué pago por persona es cada uno */
const PT_NO_NOMBRE = new Set(['de','del','la','el','en','desde','por','con','para','a','que','y','e','mil','millones','pesos','hoy','ayer','antier','anteayer','efectivo','nequi','banco','cuenta','tarjeta','bancolombia','lulo','lunes','martes','miercoles','jueves','viernes','sabado','domingo','me','le','lo','se','un','una','mi','su','como','por','pagarle','pagar']);
const cap = w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const sinTilde = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/* hasta dos palabras de un nombre desde una posición (saltando "mi"); '' si lo que sigue no parece un nombre */
function nombreTras(orig, desde){
  const t = orig.slice(desde).match(/[\p{L}]+|\d[\d.,]*/gu) || [], r = [];
  for (let i = 0; i < t.length && r.length < 2; i++) { const w = sinTilde(t[i]).toLowerCase();
    if (/^\d/.test(w)) break; if (w === 'mi' && !r.length) continue; if (PT_NO_NOMBRE.has(w)) break; r.push(cap(t[i])); }
  return r.join(' ');
}
/* igual, pero hacia atrás desde una posición ("Laura me dejó…") */
function nombreAntes(orig, hasta){
  const t = orig.slice(0, hasta).match(/[\p{L}]+|\d[\d.,]*/gu) || [], r = [];
  for (let i = t.length - 1; i >= 0 && r.length < 2; i--) { const w = sinTilde(t[i]).toLowerCase();
    if (/^\d/.test(w) || PT_NO_NOMBRE.has(w)) { if (w === 'mi' && r.length) continue; break; } r.unshift(cap(t[i])); }
  return r.join(' ');
}
/* la cuenta con más plata tuya (sin la de otros): para apartar, que la plata salga de donde sí hay */
function cuentaConPlataPropia(){
  const b = balances(), aj = ajenaPorCuenta(), l = S.accounts.filter(a => !a.hidden && !esDeuda(a) && !isCard(a) && !a.apart).map(a => ({ id:a.id, v:(b[a.id] || 0) - ((aj[a.id] || {}).v || 0) })).sort((x, y) => y.v - x.v);
  return l.length && l[0].v > 0 ? l[0].id : null;
}
/* la persona ya registrada que corresponde a ese nombre (igual, o con la misma primera palabra) */
function personaBuscar(nombre){
  const k = normP(nombre); if (!k) return null; const l = personasLista().filter(p => p.key !== '_');
  return l.find(p => p.key === k) || l.find(p => p.key.split(' ')[0] === k.split(' ')[0]) || null;
}
function personaDeParte(p){
  const sp = p.replace(/\b\d{1,2}[\/-]\d{1,2}\b/g, ' '), am = amountsIn(sp); if (!am.length) return null;
  const plain = sinTilde(p).toLowerCase(), a = am[am.length - 1]; let v = a.v; if (!a.unit && !a.money && v > 0 && v < 1000) v *= 1000;
  const trasA = desde => { const m = /\ba\s+(?!\d)/.exec(plain.slice(desde)); return m ? nombreTras(p, desde + m.index + m[0].length) : ''; };
  let tipo = null, nombre = '', m;
  if ((m = /\b(?:le\s+)?(?:debo|quede debiendo|adeudo)\b/.exec(plain))) { tipo = 'debo'; nombre = trasA(m.index + m[0].length); }
  else if ((m = /\b(?:le\s+)?preste\b/.exec(plain))) { tipo = 'preste'; nombre = trasA(m.index + m[0].length); }
  else if ((m = /\b(?:aparte|separe|reserve)\b/.exec(plain)) && /\bpara\b/.test(plain)) { tipo = 'apartar'; const q = /\bpara\s+(?:pagarle\s+a\s+|pagar\s+a\s+|pagarle\s+)?/.exec(plain); nombre = nombreTras(p, q.index + q[0].length); }
  else if ((m = /\bme\s+(?:dejo|dio|presto|entrego|dejaron)\b/.exec(plain))) { tipo = 'guardo'; nombre = nombreAntes(p, m.index) || nombreTras(p, m.index + m[0].length); }
  else if ((m = /\btengo\b[^.]*?\bde\s+(?!\d)/.exec(plain))) { tipo = 'guardo'; nombre = nombreTras(p, m.index + m[0].length); }
  else if ((m = /\ble\s+(devolvi|pague|abone|transferi|consigne|envie)\b/.exec(plain))) { tipo = m[1] === 'devolvi' ? 'devolver' : 'pago'; nombre = trasA(m.index + m[0].length); }
  else if ((m = /\bme\s+(?:pago|pagaron|abono|devolvio|consigno|transfirio)\b/.exec(plain))) { tipo = 'cobrar'; nombre = nombreAntes(p, m.index) || nombreTras(p, m.index + m[0].length); }
  if (!tipo || !nombre) return null;
  const pl = personaBuscar(nombre);
  /* pagos, cobros y apartados solo si esa persona de verdad tiene algo abierto: si no, es un gasto o ingreso normal */
  if (tipo === 'pago' || tipo === 'apartar') { if (!pl || !(pl.debes > 0)) return null; }
  else if (tipo === 'devolver') { if (!pl || !(pl.suya > 0)) return null; }
  else if (tipo === 'cobrar') { if (!pl || !(pl.teDebe > 0)) return null; }
  const persona = pl ? pl.nombre : personaCanon(nombre);
  const acc = accountIn(p) || (tipo === 'devolver' && ajenaLibre(persona).acc) || (tipo === 'apartar' && cuentaConPlataPropia()) || lastAccount();
  return { type:'persona', pt:tipo, persona, amount:v, date:dateIn(p), note:'', accountId:acc, src:'texto' };
}
/* separa lo que es de personas de lo demás: { items, resto } (resto = texto que sigue siendo gastos o ingresos normales) */
function personaParse(text){
  const parts = String(text).replace(/\n+/g, ' , ').split(/\s*(?:(?<!\d),|,(?!\d)|;|\+|\sy\s|\se\s)\s*/i).map(x => x.trim()).filter(Boolean), merged = [];
  for (const p of parts) { if (amountsIn(p.replace(/\b\d{1,2}[\/-]\d{1,2}\b/g, ' ')).length || !merged.length) merged.push(p); else merged[merged.length - 1] += ' ' + p; }
  const items = [], resto = [];
  for (const p of merged) { let it = null; try { it = personaDeParte(p); } catch (_) {} if (it) items.push(it); else resto.push(p); }
  return { items, resto:resto.join(' , ') };
}
/* lo que lee la IA: nombre, tipo y cuenta; se valida igual que lo local */
function personaIA(x){
  if (!x || x.type !== 'persona' || !PT[x.pt]) return null;
  const amount = Math.round(Math.abs(+x.amount || 0)), nombre = String(x.persona || '').trim(); if (!amount || !nombre) return null;
  const a = accById(x.accountId), pl = personaBuscar(nombre);
  return { type:'persona', pt:x.pt, persona:pl ? pl.nombre : personaCanon(nombre), amount, date:/^\d{4}-\d{2}-\d{2}$/.test(x.date || '') ? x.date : iso(new Date()), note:'', accountId:a && !isCard(a) && !esDeuda(a) ? a.id : lastAccount(), src:'ia' };
}
/* qué le cuenta la IA de las personas que ya existen, para que sepa si es un pago o un gasto normal */
const personaPrompt = () => { const l = personasLista().filter(p => p.key !== '_' && personaAbierta(p)).map(p => p.nombre + ' (' + personaResumen(p) + ')');
  return '- persona: si el movimiento es con otra persona por plata que se debe, se presta o se guarda, usa type "persona" con pt: debo (el usuario le debe y esa plata no está en sus cuentas), guardo (alguien le dejó o le prestó plata que queda en su cuenta), preste (el usuario le prestó), pago (el usuario le pagó lo que le debe), devolver (el usuario le devolvió plata que le había dejado), cobrar (la persona le pagó lo que le debía) o apartar (el usuario separa plata de su cuenta para pagarle, sin entregársela todavía). Para estos usa persona = nombre y accountId = cuenta donde queda o de donde sale la plata (null en debo). Gastos, ingresos y transferencias entre sus cuentas NO son persona.\n' +
    (l.length ? 'Personas con saldo abierto: ' + l.join('; ') + '.\n' : ''); };
/* se aplica una persona de la revisión con las mismas funciones de la hoja de Personas */
function personaVozAplicar(it){
  if (it.pt === 'debo' || it.pt === 'guardo' || it.pt === 'preste') return deudaNuevaAplicar({ tipo:it.pt, persona:it.persona, amt:it.amount, acc:it.accountId, note:it.note || '', date:it.date });
  const pl = personaBuscar(it.persona); if (!pl) return { err:'No encontré a ' + it.persona + ' en Personas.' };
  return personaPagoAplicar(pl.key, PT_K[it.pt], it.amount, it.accountId, it.date);
}
function rvPersona(it, i){
  const op = Object.keys(PT).map(k => '<option value="' + k + '"' + (it.pt === k ? ' selected' : '') + '>' + PT[k] + '</option>').join('');
  const cuenta = it.pt !== 'debo', lbl = { guardo:'¿En qué cuenta está?', cobrar:'¿A qué cuenta llegó?', apartar:'Se queda en', devolver:'¿De qué cuenta sale?' }[it.pt] || '¿De qué cuenta sale?';
  const gente = personasLista().filter(p => p.key !== '_').map(p => '<option value="' + esc(p.nombre) + '"></option>').join('');
  return '<div class="rv' + (it.err ? ' bad' : '') + '"><select class="inp" data-rv="' + i + '" data-f="pt" aria-label="Qué pasó">' + op + '</select><div class="rv-top">' +
    '<div class="rv-amt"><span>$</span><input inputmode="numeric" class="num" data-rv="' + i + '" data-f="amount" value="' + (it.amount ? nf.format(it.amount) : '') + '" aria-label="Valor"></div>' +
    '<button class="x" data-rvdel="' + i + '" aria-label="Descartar">✕</button></div>' +
    '<input class="inp" data-rv="' + i + '" data-f="persona" value="' + esc(it.persona || '') + '" placeholder="¿Con quién?" list="rv-gente" autocomplete="off" aria-label="Persona"><datalist id="rv-gente">' + gente + '</datalist>' +
    (cuenta ? '<div class="field"><span class="label">' + lbl + '</span><div class="cgrid">' + S.accounts.filter(a => !a.hidden && !esDeuda(a) && !isCard(a)).map(a => '<button type="button" class="ctile sm" data-rvacc="' + i + '" data-id="' + esc(a.id) + '" aria-pressed="' + (it.accountId === a.id) + '"><span class="nm">' + esc(accShort(a.id)) + '</span></button>').join('') + '</div></div>' : '') +
    '<input class="inp" data-rv="' + i + '" data-f="note" value="' + esc(it.note || '') + '" placeholder="Concepto (opcional)" aria-label="Concepto">' +
    '<input class="inp" type="date" data-rv="' + i + '" data-f="date" value="' + it.date + '" aria-label="Fecha">' +
    (it.err ? '<span class="err" style="margin:0">' + esc(it.err) + '</span>' : '') + '</div>';
}
