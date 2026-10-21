/* Restaurar un respaldo pegado como texto, atajos de teclado y bloqueo del zoom accidental. */
/* ----- restaurar desde texto ----- */
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  if (el.id === 'pastejson') { F = null; openSheet('<div class="sheet-h"><b id="sheet-title">Pegar respaldo</b><button class="x" data-close aria-label="Cerrar">✕</button></div><div class="form"><div class="smart"><textarea id="rs-txt" rows="6" placeholder="Pega aquí el respaldo de Caudal"></textarea></div><div class="err" id="rs-err" style="margin:0"></div><button class="btn block" id="rs-go">Restaurar</button><p class="note" style="padding:0">Reemplaza los datos de este dispositivo' + (cloudAI() ? ' y de tu nube' : '') + ' por los del respaldo.</p></div>'); return; }
  if (el.id === 'rs-go') { try { const s = normBackup(JSON.parse($('#rs-txt').value)); if (!s || !s.transactions || !s.accounts || !s.categories) throw 0;
      s.demo = false; S = completarEstado(s); sortTx(S); save(); closeSheet(); ui.view = 'inicio'; ui.offset = 0; render(); toast(nf.format(S.transactions.length) + ' movimientos restaurados', 3000); }
    catch (_) { $('#rs-err').textContent = 'Ese texto no es un respaldo de Caudal. Cópialo de nuevo completo.'; } }
});


/* ----- atajos de teclado en el computador ----- */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
  if (!$('#sheet').hidden || document.getElementById('auth')) return;
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); txForm(null); }
  else if (e.key === '/') { e.preventDefault(); smartOpen('texto'); }
});

/* sin zoom accidental: pellizco y doble toque */
['gesturestart','gesturechange','gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive:false }));
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive:false });
