/* ---------- Editar cuentas: dónde guardas la plata ----------
   Crear y editar una cuenta en la misma hoja: nombre, si cuenta en el disponible, si es tarjeta de crédito
   (de qué cuenta se paga, día de corte y día de pago) y su lugar en la lista. Ocultar, volver a mostrar y
   eliminar (solo si no la usa nada; si no, se oculta). Las cuentas no se agrupan en pantalla: el grupo se
   asigna solo por dentro (grupoAuto), porque la IA y algunos cálculos reconocen el efectivo y el ahorro por él.
   Una cuenta puede ir dentro de otra como subcuenta (parentAcc): solo un nivel, y nunca una tarjeta.
   Las deudas se manejan en Personas. */
let AE = null;
const usoCuenta = id => S.transactions.filter(t => t.accountId === id || t.toAccountId === id || t.fund === id).length;
/* lo que impide borrar: movimientos, recibos, pagos fijos, el plan o una tarjeta que se paga desde ella */
function cuentaEnUso(id){
  const n = usoCuenta(id); if (n) return plural(n, 'movimiento', 'movimientos');
  if ((S.bills || []).some(b => b.accountId === id)) return 'un recibo';
  if ((S.recurring || []).some(r => r.accountId === id)) return 'un pago fijo';
  if ((S.plans || []).some(p => p.from === id || p.surplus === id || (p.items || []).some(i => i.acc === id))) return 'tu plan';
  if (S.accounts.some(a => a.card && a.card.pocket === id)) return 'una tarjeta que se paga desde ella';
  return '';
}
/* grupo interno según el nombre y el tipo */
const grupoAuto = (nombre, tarjeta) => tarjeta ? 'Tarjetas' : /efectivo|billete/i.test(nombre) ? 'Efectivo' : /ahorro|cdt|bolsillo/i.test(nombre) ? 'Ahorro' : 'Cuentas';

function accEditSheet(id, madre){
  const a = id ? accById(id) : null;
  AE = a ? { id, name:a.name, apart:!!a.apart, tarjeta:isCard(a), pocket:a.card && a.card.pocket || null, cut:a.card && a.card.cut || '', due:a.card && a.card.due || '', madre:a.parentAcc || null }
         : { id:null, name:'', apart:false, tarjeta:false, pocket:null, cut:'', due:'', bal:'', madre:madre && accById(madre) ? madre : null };
  accEditDraw();
}
function accEditDraw(){
  const nuevo = !AE.id, a = nuevo ? null : accById(AE.id);
  const opts = S.accounts.filter(x => !x.hidden && !esDeuda(x) && !isCard(x) && x.id !== AE.id);
  const dia = (k, t) => '<div class="field"><label class="label" for="ae-' + k + '">' + t + '</label><input class="inp num" id="ae-' + k + '" inputmode="numeric" maxlength="2" value="' + esc(String(AE[k] || '')) + '" placeholder="1 a 31"></div>';
  const misSubs = AE.id ? subsDe(AE.id) : [], madres = S.accounts.filter(x => !x.hidden && !esDeuda(x) && !isCard(x) && !x.parentAcc && x.id !== AE.id).sort(ordenCuenta);
  let h = '<div class="sheet-h"><b id="sheet-title">' + (nuevo ? (AE.madre ? 'Nueva subcuenta' : 'Nueva cuenta') : AE.madre ? 'Editar subcuenta' : 'Editar cuenta') + '</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form aedit">' +
    '<div class="field"><label class="label" for="ae-name">Nombre</label><input class="inp" id="ae-name" value="' + esc(AE.name) + '" placeholder="' + (AE.madre ? 'Ej. Ahorro, Gastos del mes, Moto' : 'Ej. Nequi, Bancolombia, Efectivo') + '" autocomplete="off"></div>' +
    (AE.madre ? '' : '<div class="field"><span class="label">Tipo</span><div class="chips"><button type="button" class="chip" data-aetipo="0" aria-pressed="' + !AE.tarjeta + '">Cuenta o efectivo</button><button type="button" class="chip" data-aetipo="1" aria-pressed="' + AE.tarjeta + '">Tarjeta de crédito</button></div></div>');
  if (AE.tarjeta) h += '<div class="field"><span class="label">¿Desde qué cuenta la pagas?</span>' + (opts.length ? '<div class="cgrid">' + opts.map(x => '<button type="button" class="ctile sm" data-aepk="' + esc(x.id) + '" aria-pressed="' + (AE.pocket === x.id) + '"><span class="nm">' + esc(accShort(x.id)) + '</span></button>').join('') + '</div>' : '<p class="note" style="padding:0">Primero crea la cuenta desde la que pagas la tarjeta.</p>') + '</div>' +
    '<div class="two">' + dia('cut', 'Día de corte') + dia('due', 'Día de pago') + '</div>' +
    '<p class="note" style="padding:0;margin:0">Lo que compres con la tarjeta queda como deuda en ella, y la app te recuerda pasar la plata a la cuenta desde la que la pagas.</p>';
  else { h += misSubs.length ? '' : '<div class="field"><span class="label">¿Va dentro de otra cuenta?</span><div class="chips"><button type="button" class="chip" data-aemadre="" aria-pressed="' + !AE.madre + '">No, es una cuenta</button>' +
      madres.map(x => '<button type="button" class="chip" data-aemadre="' + esc(x.id) + '" aria-pressed="' + (AE.madre === x.id) + '">Dentro de ' + esc(x.name) + '</button>').join('') + '</div>' +
      '<span class="tile-s">Una subcuenta es un bolsillo de la cuenta: por ejemplo, la parte de ahorro y la parte de gastos de tu banco.</span></div>';
    h += '<button type="button" class="pill" style="align-self:flex-start" data-aeapart aria-pressed="' + !AE.apart + '">' + (AE.apart ? '○ Apartada: no cuenta en tu disponible' : '● Cuenta en tu disponible') + '</button>' +
    '<p class="note" style="padding:0;margin:0">Apártala si es plata que no quieres tocar, como un ahorro o un CDT.</p>';
    if (AE.id && !AE.madre) { const b = balances();
      h += '<div class="field"><span class="label">Subcuentas</span>' + (misSubs.length ? '<div>' + misSubs.map((x, k) => '<div class="set deuda"' + (k ? '' : ' style="border-top:0"') + '><button class="t" data-accedit="' + esc(x.id) + '"><b>' + esc(x.name) + '</b><span>' + (x.apart ? 'Apartada · ' : '') + money(b[x.id] || 0) + '</span></button>' + ordenBtns('data-accmove', x.id, x.name, k, misSubs.length) + '</div>').join('') + '</div>' : '<p class="note" style="padding:0;margin:0">Divide esta cuenta en bolsillos, como ahorro y gastos. El total de la cuenta es la suma de todos.</p>') +
        '<button class="btn block ghost" type="button" data-accedit="" data-madre="' + esc(AE.id) + '">+ Nueva subcuenta</button></div>'; } }
  if (nuevo) h += '<div class="field"><label class="label" for="ae-bal">' + (AE.tarjeta ? 'Lo que debes hoy en la tarjeta' : 'Saldo actual') + '</label><input class="inp num" id="ae-bal" inputmode="numeric" value="' + esc(AE.bal || '') + '" placeholder="0"></div>';
  h += '<div class="err" id="ae-err"></div><button class="btn accent block" type="button" data-aego>' + (nuevo ? 'Crear cuenta' : 'Guardar cambios') + '</button>';
  if (!nuevo) { const uso = cuentaEnUso(AE.id) || (misSubs.length ? plural(misSubs.length, 'subcuenta', 'subcuentas') : ''), l = hermanas(AE.id), i = l.findIndex(x => x.id === AE.id);
    if (l.length > 1 && i >= 0) h += '<div class="field"><span class="label">Lugar en la lista: ' + (i + 1) + ' de ' + l.length + '</span><div class="two">' +
      '<button class="btn ghost" type="button" data-accmove="' + esc(AE.id) + '" data-dir="-1"' + (i ? '' : ' disabled') + '>' + ICO_SUBIR + ' Subir</button><button class="btn ghost" type="button" data-accmove="' + esc(AE.id) + '" data-dir="1"' + (i < l.length - 1 ? '' : ' disabled') + '>' + ICO_BAJAR + ' Bajar</button></div></div>';
    h += '<div class="two"><button class="btn ghost" type="button" data-aehide>' + (a.hidden ? 'Volver a mostrar' : 'Ocultar') + '</button>' +
      '<button class="btn ghost' + (AE.del ? ' danger' : '') + '" type="button" data-aedel' + (uso ? ' disabled' : '') + '>' + (AE.del ? '¿Seguro? Eliminar' : 'Eliminar') + '</button></div>' +
      '<p class="note" style="padding:0;margin:0">' + (uso ? 'No se puede eliminar porque la usa ' + uso + '. Ocúltala: deja de salir en tus listas y su historial se conserva.' : 'Ocultarla la quita de tus listas sin borrar nada.') + '</p>'; }
  h += '</div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
/* lo escrito sobrevive a redibujar la hoja al tocar una opción */
const aeLeer = () => { const v = id => { const el = $('#ae-' + id); return el ? el.value.trim() : null; };
  const n = v('name'), c = v('cut'), d = v('due'), b = v('bal');
  if (n !== null) AE.name = n; if (c !== null) AE.cut = c; if (d !== null) AE.due = d; if (b !== null) AE.bal = b; };
function accEditGuardar(){
  const err = m => { $('#ae-err').textContent = m; };
  if (!AE.name) return err('Escribe el nombre de la cuenta.');
  if (AE.tarjeta) AE.madre = null;
  if (S.accounts.some(x => x.id !== AE.id && !x.hidden && (x.parentAcc || null) === (AE.madre || null) && x.name.trim().toLowerCase() === AE.name.toLowerCase())) return err(AE.madre ? 'Esa cuenta ya tiene una subcuenta con ese nombre.' : 'Ya tienes una cuenta con ese nombre.');
  const dia = s => { const n = parseInt(s, 10); return n >= 1 && n <= 31 ? n : null; };
  if (AE.tarjeta) { if (!accById(AE.pocket)) return err('Elige desde qué cuenta pagas la tarjeta.');
    if (AE.cut && !dia(AE.cut)) return err('El día de corte va de 1 a 31.'); if (AE.due && !dia(AE.due)) return err('El día de pago va de 1 a 31.'); }
  let a = AE.id ? accById(AE.id) : null;
  if (!a) { a = { id:uid(), name:'', group:'', order:S.accounts.length + 1, hidden:false }; S.accounts.push(a); }
  /* el grupo interno solo se recalcula al crear o al cambiar el tipo: así no se pierde lo que ya traía */
  if (!AE.id || isCard(a) !== AE.tarjeta || !a.group) a.group = grupoAuto(AE.name, AE.tarjeta);
  a.name = AE.name;
  if (AE.tarjeta) { a.card = { ...(a.card || {}), pocket:AE.pocket, cut:dia(AE.cut), due:dia(AE.due) }; delete a.apart; }
  else { delete a.card; if (AE.apart) a.apart = true; else delete a.apart; }
  if (AE.madre && !AE.tarjeta) { if (a.parentAcc !== AE.madre) { const her = subsDe(AE.madre).filter(x => x.id !== a.id); a.order = her.length ? Math.max(...her.map(x => x.order || 0)) + 1 : (accById(AE.madre).order || 0) + .5; } a.parentAcc = AE.madre; } else delete a.parentAcc;
  if (!AE.id) { const v = leerPesos(AE.bal || ''); /* en una tarjeta, lo que debes queda como saldo negativo */
    if (v) S.transactions.push({ id:uid(), type:'ajuste', amount:AE.tarjeta ? -v : v, date:iso(new Date()), ts:Date.now(), accountId:a.id, note:'Saldo inicial' }); }
  /* posiciones siempre enteras (la base las guarda así): la subcuenta queda justo después de su cuenta */
  if (a.parentAcc) cuentasOrden().forEach((x, k) => { x.order = k + 1; });
  const nuevo = !AE.id, madre = AE.madre; sortTx(S); save(); AE = null;
  if (nuevo && madre) { accEditSheet(madre); render(); return toast('Subcuenta creada'); }
  closeSheet(); render(); toast(nuevo ? 'Cuenta creada' : 'Cuenta actualizada');
}
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (d.accedit !== undefined) { e.stopPropagation(); if (AE && el.closest('.aedit')) aeLeer(); return accEditSheet(d.accedit || null, d.madre); }
  if (d.accmove) { e.stopPropagation(); if (AE) aeLeer(); moverCuenta(d.accmove, +d.dir); if (AE && !$('#sheet').hidden) accEditDraw(); return; }
  if (!AE || !el.closest('.aedit')) return;
  e.stopPropagation(); aeLeer();
  if (d.aetipo) { AE.tarjeta = d.aetipo === '1'; return accEditDraw(); }
  if (d.aepk) { AE.pocket = d.aepk; return accEditDraw(); }
  if (d.aemadre !== undefined) { AE.madre = d.aemadre || null; return accEditDraw(); }
  if (d.aeapart !== undefined) { AE.apart = !AE.apart; return accEditDraw(); }
  if (d.aego !== undefined) return accEditGuardar();
  if (d.aehide !== undefined) { const a = accById(AE.id); a.hidden = !a.hidden; save(); AE = null; closeSheet(); render(); return toast(a.hidden ? 'Cuenta oculta' : 'Cuenta visible de nuevo'); }
  if (d.aedel !== undefined) { if (cuentaEnUso(AE.id)) return;
    if (!AE.del) { AE.del = true; return accEditDraw(); }
    S.accounts = S.accounts.filter(x => x.id !== AE.id); if (S.lastAccount === AE.id) delete S.lastAccount;
    save(); AE = null; closeSheet(); render(); return toast('Cuenta eliminada'); }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'ae-bal') pesosCampo(e.target); });

/* ----- orden: subir o bajar una cuenta entre sus hermanas (las principales entre sí, las subcuentas dentro de su cuenta) ----- */
const hermanas = id => { const a = accById(id); return a && a.parentAcc ? subsDe(a.parentAcc) : cuentasOrden().filter(x => !madreDe(x)); };
function moverCuenta(id, dir){
  const l = hermanas(id), i = l.findIndex(x => x.id === id), j = i + dir; if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]]; const base = l.map(x => x.order || 0).sort((x, y) => x - y); l.forEach((x, k) => { x.order = base[k]; });
  if (!accById(id).parentAcc) cuentasOrden().forEach((x, k) => { x.order = k + 1; }); /* las principales y sus bolsillos quedan en orden seguido */
  save(); render();
}

/* ----- Ajustes › Cuentas ----- */
function cuentasAdminCard(){
  const b = balances(), vis = cuentasOrden().filter(a => !madreDe(a)), ocultas = S.accounts.filter(a => a.hidden && !esDeuda(a));
  const fila = (a, k, n, sub) => '<div class="set deuda' + (sub ? ' subacc' : '') + '"' + (k || sub ? '' : ' style="border-top:0"') + '><button class="t" data-accedit="' + esc(a.id) + '"><b>' + esc(accShort(a.id)) + '</b><span>' + (isCard(a) ? 'Tarjeta · se paga desde ' + esc(accShort(a.card.pocket)) : a.apart ? 'Apartada' : 'En tu disponible') + ' · ' + money(b[a.id] || 0) + '</span></button>' +
    ordenBtns('data-accmove', a.id, a.name, k, n) + '</div>';
  let h = '<section class="card"><div class="card-h"><h2>Tus cuentas</h2><button class="pill" data-accedit>Nueva cuenta</button></div>' +
    '<p class="insight">Toca una cuenta para cambiarle el nombre o el tipo. Con las flechas cambias el orden en que aparecen.</p>' +
    '<div>' + vis.map((a, k) => fila(a, k, vis.length) + subsDe(a.id).map((x, i, l) => fila(x, i, l.length, true)).join('')).join('') + '</div>';
  if (ocultas.length) h += '<div class="pgroup">Ocultas<span class="num">' + ocultas.length + '</span></div><div>' + ocultas.map((a, k) => fila(a, k, 1)).join('') + '</div>';
  return h + '<p class="note" style="padding:0">Lo que debes, lo que te deben y la plata de otros se maneja en Personas.</p></section>';
}
