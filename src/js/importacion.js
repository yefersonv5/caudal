/* Importación: respaldo de Money Manager (.mmbak) y respaldo propio (.json). */
let sqlReady = null;
function loadSql(){
  if (sqlReady) return sqlReady;
  const srcs = ['https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm.js', 'https://unpkg.com/sql.js@1.10.3/dist/sql-asm.js'];
  sqlReady = new Promise((res, rej) => {
    const tryLoad = i => { if (i >= srcs.length) return rej(new Error('No se pudo cargar el lector de respaldos.'));
      const s = document.createElement('script'); s.src = srcs[i]; s.onload = () => window.initSqlJs().then(res, rej); s.onerror = () => tryLoad(i + 1); document.head.appendChild(s); };
    tryLoad(0);
  });
  sqlReady.catch(() => { sqlReady = null; });
  return sqlReady;
}
async function importMM(file){
  const msg = $('#impmsg'); msg.textContent = 'Leyendo ' + file.name + '…';
  try {
    const SQL = await loadSql();
    const db = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
    const st = mmImport(db); db.close();
    if (!st.transactions.length && !st.accounts.length) throw new Error('El archivo no tiene movimientos.');
    const keep = S.demo ? {} : { bills:S.bills, recurring:S.recurring, cardMap:S.cardMap, plans:S.plans };
    const nm = S.settings && S.settings.name, rt = S.settings && S.settings.rate;
    S = st; S.plans = keep.plans || []; S.bills = keep.bills || []; S.recurring = keep.recurring || []; S.cardMap = keep.cardMap || {}; S.inbox = [];
    if (nm) S.settings.name = nm; if (rt) S.settings.rate = rt; save(); ui.offset = 0; ui.accFilter = null; ui.view = 'inicio'; render();
    toast(nf.format(st.transactions.length) + ' movimientos importados');
  } catch(e){ msg.textContent = 'No pude leer ese archivo. Verifica que sea el respaldo .mmbak de Money Manager. (' + e.message + ')'; }
}
async function importJSON(file){
  try { const s = normBackup(JSON.parse(await file.text())); if (!s.transactions || !s.accounts || !s.categories) throw new Error('formato');
    S = s; save(); ui.view = 'inicio'; ui.offset = 0; render(); toast('Respaldo restaurado'); }
  catch(e){ $('#impmsg').textContent = 'Ese archivo no es un respaldo de Caudal.'; }
}
