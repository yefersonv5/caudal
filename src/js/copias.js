/* ---------- Copias en el celular: para periodos largos sin internet ----------
   Todo lo que se registra ya queda en el celular (localStorage) y se sube a la nube al volver la conexión.
   Además, aquí se guarda una copia completa por día en la base del navegador (IndexedDB), las últimas
   COPIAS_DIAS, y una copia antes de que la nube reemplace los datos del celular. Se pueden restaurar
   o descargar desde Ajustes › Datos. Se pide almacenamiento persistente para que el iPhone no las borre. */
const COPIAS_DIAS = 14, COPIAS_PREVIAS = 3;
let COPIAS = null, COPIA_T = null;

function copiasDB(){
  return new Promise((ok, no) => {
    try { const r = indexedDB.open('caudal-copias', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('copias', { keyPath:'id' });
      r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
    } catch (e) { no(e); }
  });
}
async function copiasTx(modo, fn){
  const db = await copiasDB();
  return new Promise((ok, no) => { const tx = db.transaction('copias', modo), st = tx.objectStore('copias'), r = fn(st);
    tx.oncomplete = () => { db.close(); ok(r && r.result); }; tx.onerror = () => { db.close(); no(tx.error); }; });
}
/* id: el día (AAAA-MM-DD) para la copia diaria, o 'previa-<ts>' para la que se toma antes de sincronizar */
async function copiaGuardar(id, data){
  if (S.demo) return;
  const json = data || JSON.stringify(S), n = (JSON.parse(json).transactions || []).length;
  try {
    await copiasTx('readwrite', st => st.put({ id, ts:Date.now(), n, data:json }));
    const todas = await copiasLeer(), diarias = todas.filter(c => !c.id.startsWith('previa')), previas = todas.filter(c => c.id.startsWith('previa'));
    const sobran = diarias.slice(COPIAS_DIAS).concat(previas.slice(COPIAS_PREVIAS));
    if (sobran.length) await copiasTx('readwrite', st => { sobran.forEach(c => st.delete(c.id)); });
    COPIAS = null;
  } catch (_) { /* sin IndexedDB (incógnito): los datos siguen en localStorage */ }
}
/* de la más nueva a la más vieja, sin el contenido (solo para listar) */
async function copiasLeer(){
  const all = await copiasTx('readonly', st => st.getAll());
  return (all || []).map(c => ({ id:c.id, ts:c.ts, n:c.n })).sort((a, b) => b.ts - a.ts);
}
const copiaDato = async id => { const c = await copiasTx('readonly', st => st.get(id)); return c && c.data; };

/* copia del día: unos segundos después de cada cambio, sobrescribe la de hoy */
const _saveCopias = save;
save = function(){ const r = _saveCopias.apply(this, arguments); clearTimeout(COPIA_T); COPIA_T = setTimeout(() => copiaGuardar(iso(new Date())), 4000); return r; };
/* antes de que la nube reemplace lo del celular (nube.js) */
const copiaPrevia = () => { if (!S.demo) copiaGuardar('previa-' + Date.now(), JSON.stringify(S)); };

/* que el iPhone no borre los datos del celular cuando le falta espacio */
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()); } catch (_) {}

/* ----- aviso sin conexión en Inicio ----- */
function offlineBanner(){
  if (navigator.onLine !== false || S.demo) return '';
  return '<div class="banner"><span><b>Sin conexión.</b> Todo lo que registres queda guardado en tu celular y se sube solo cuando vuelva el internet.</span></div>';
}
window.addEventListener('offline', () => render());
window.addEventListener('online', () => { render(); toast('Volvió la conexión: subiendo tus cambios'); });

/* ----- Ajustes › Datos ----- */
function copiasRow(){
  if (S.demo) return '';
  if (!COPIAS) { copiasLeer().then(l => { COPIAS = l; if (ui.view === 'ajustes') render(); }).catch(() => { COPIAS = []; }); COPIAS = []; }
  const ult = COPIAS[0], hace = ult ? fmtShort(new Date(ult.ts)) + ', ' + new Date(ult.ts).toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' }) : '';
  return '<div class="set"><div class="t"><b>Copias en este celular</b><span>' + (ult ? COPIAS.length + (COPIAS.length === 1 ? ' copia' : ' copias') + ' · la última del ' + hace + ' · funcionan sin internet' : 'Se crea una cada día que registres algo, aunque no haya internet.') + '</span></div>' +
    (ult ? '<button class="btn sm ghost" id="copias">Ver</button>' : '') + '</div>';
}
function copiasSheet(arm){
  const lista = COPIAS || [];
  const h = '<div class="sheet-h"><b id="sheet-title">Copias en este celular</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form">' +
    '<p class="insight" style="margin:0">Una por día (las últimas ' + COPIAS_DIAS + ') y otra cada vez que la nube cambió los datos del celular. Restaurar reemplaza lo que tienes ahora por esa copia.</p><div>' +
    lista.map((c, i) => '<div class="set"' + (i ? '' : ' style="border-top:0"') + '><div class="t"><b>' + (c.id.startsWith('previa') ? 'Antes de sincronizar · ' : '') + fmtShort(new Date(c.ts)) + ', ' + new Date(c.ts).toLocaleTimeString('es-CO', { hour:'numeric', minute:'2-digit' }) + '</b><span>' + nf.format(c.n) + (c.n === 1 ? ' movimiento' : ' movimientos') + '</span></div>' +
      '<button class="pill" data-cpdesc="' + esc(c.id) + '">Descargar</button><button class="pill' + (arm === c.id ? ' solid' : '') + '" data-cprest="' + esc(c.id) + '">' + (arm === c.id ? '¿Seguro?' : 'Restaurar') + '</button></div>').join('') + '</div></div>';
  if ($('#sheet').hidden) openSheet(h); else $('#sheet').innerHTML = '<div class="grab"></div>' + h;
}
document.addEventListener('click', async e => {
  const el = e.target.closest('button'); if (!el) return; const d = el.dataset;
  if (el.id === 'copias') { e.stopPropagation(); COPIAS = await copiasLeer().catch(() => []); return copiasSheet(); }
  if (d.cpdesc) { e.stopPropagation(); const data = await copiaDato(d.cpdesc); if (!data) return toast('No encontré esa copia');
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([data], { type:'application/json' }));
    a.href = url; a.download = 'caudal-copia-' + d.cpdesc.replace('previa-', 'previa ') + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1e4); return; }
  if (d.cprest) { e.stopPropagation();
    if (!el.classList.contains('solid')) return copiasSheet(d.cprest);
    const data = await copiaDato(d.cprest); if (!data) return toast('No encontré esa copia');
    copiaPrevia(); /* por si se arrepiente: lo de ahora también queda guardado */
    S = completarEstado(normBackup(JSON.parse(data))); S.demo = false; sortTx(S); save(); closeSheet(); ui.offset = 0; go('inicio');
    return toast('Copia restaurada'); }
}, true);
