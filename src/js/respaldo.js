/* Respaldo descargable y recordatorio mensual. */
/* el respaldo semanal del atajo viene por tablas (como la base); se convierte al formato de la app */
function normBackup(s){ return s && s.app === 'Caudal' && Array.isArray(s.settings) ? fromRows({ inbox:[], ...s }) : s; }
function lastBackup(){ let l = 0; try { l = +localStorage.getItem('caudal.lastBackup') || 0; } catch (_) {} const a = S.settings && S.settings.backupAt ? Date.parse(S.settings.backupAt) : 0; return Math.max(l, a || 0); }
function backupAge(){ const l = lastBackup(); if (!l) return 'Archivo con todos tus datos. Aún no has guardado ninguno en este teléfono.'; const d = Math.floor((Date.now() - l) / 864e5); return 'Último: ' + (d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días') + '. Se guarda en Archivos del iPhone.'; }
function autoBackupRow(){
  const a = S.settings && S.settings.backupAt ? Date.parse(S.settings.backupAt) : 0, d = a ? Math.floor((Date.now() - a) / 864e5) : null;
  const url = (typeof CTOKEN !== 'undefined' && CTOKEN && typeof CLOUD !== 'undefined') ? CLOUD.url + '/functions/v1/respaldo?k=' + CTOKEN : '';
  return '<div class="set"><div class="t"><b>Respaldo automático en iCloud</b><span>' + (a ? 'Último: ' + (d === 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días') + '. Lo hace un atajo del iPhone.' : 'Aún no está activo. Se configura una vez con un atajo del iPhone.') + '</span></div>' +
    (url ? '<button class="btn sm ghost" data-copy="' + esc(url) + '">Copiar dirección</button>' : '') + '</div>' +
    '<details class="howto"><summary>Cómo activarlo (2 minutos)</summary><div>' +
    '1. En Archivos crea la carpeta <b>iCloud Drive › Caudal</b> (o la que quieras).<br>' +
    '2. En Atajos: <b>+</b> → nombre <b>Respaldo Caudal</b>.<br>' +
    '3. Acción <b>Obtener contenido de URL</b> y pega la dirección (botón Copiar dirección). Método GET.<br>' +
    '4. Acción <b>Establecer nombre</b>: <b>caudal-respaldo.json</b> (siempre el mismo, así se sobrescribe).<br>' +
    '5. Acción <b>Guardar archivo</b>: apaga "Preguntar dónde guardar", elige tu carpeta y prende <b>Sobrescribir si existe</b>.<br>' +
    '6. Pestaña Automatización → <b>+</b> → <b>Hora del día</b>: elige la hora y la frecuencia (diaria, semanal o mensual) → <b>Ejecutar inmediatamente</b> → el atajo Respaldo Caudal.<br>' +
    'Cada vez que corra, aquí verás la fecha del último respaldo.</div></details>';
}
async function downloadBackup(){
  const name = 'caudal-respaldo-' + iso(new Date()) + '.json', data = JSON.stringify(S);
  const mark = () => { try { localStorage.setItem('caudal.lastBackup', String(Date.now())); } catch (_) {} render(); };
  try {
    const file = new File([data], name, { type:'application/json' });
    if (navigator.canShare && navigator.canShare({ files:[file] })) { await navigator.share({ files:[file], title:'Respaldo de Caudal' }); mark(); return toast('Respaldo guardado'); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type:'application/json' })); a.download = name; a.click(); mark(); toast('Respaldo descargado');
  } catch (e) { if (e && e.name === 'AbortError') return; toast('No se pudo guardar el respaldo'); }
}
function backupReminder(){
  if (S.demo || !(S.transactions || []).length) return '';
  const l = lastBackup(); if (l && Date.now() - l < 30 * 864e5) return '';
  return '<div class="banner"><span><b>' + (l ? 'Hace más de un mes no guardas un respaldo.' : 'Guarda tu primer respaldo.') + '</b> Un archivo con todos tus datos, por si acaso.</span><button class="btn sm" data-backup>Guardar</button></div>';
}
document.addEventListener('click', e => { if (e.target.closest('[data-backup]')) { e.stopPropagation(); downloadBackup(); } }, true);

function smartPill(){
  return '<div class="ask"><button class="ask-main" data-smart="texto">' + SPARK + '<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Anota un gasto…</span></button><button class="ask-ic" data-smart="voz" aria-label="Registrar por voz">' + MIC + '</button></div>';
}
