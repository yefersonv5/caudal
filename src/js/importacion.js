/* Importación: restaurar un respaldo propio (.json). */
async function importJSON(file){
  try { const s = normBackup(JSON.parse(await file.text())); if (!s.transactions || !s.accounts || !s.categories) throw new Error('formato');
    S = s; save(); ui.view = 'inicio'; ui.offset = 0; render(); toast('Respaldo restaurado'); }
  catch(e){ $('#impmsg').textContent = 'Ese archivo no es un respaldo de Caudal.'; }
}
