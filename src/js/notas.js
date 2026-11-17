/* Notas habituales: al registrar, Caudal propone las notas que más usas (del mismo tipo y, si ya elegiste,
   de la misma categoría), y filtra mientras escribes. Al guardar, una nota que ya existe
   escrita de otra forma ("pago mamá", "Pago Mamá") queda escrita como la usas más, así todo queda unificado. */
/* texto sin mayúsculas, tildes ni espacios de más, para comparar (también lo usa buscar.js) */
const normP = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const notaClave = s => normP(s).replace(/[^\p{L}\p{N} ]/gu, '').trim();
/* notas usadas: clave → { txt (la forma más usada), n, ult } */
function notasUsadas(filtro){
  const m = new Map();
  for (const t of S.transactions) {
    const n = (t.note || '').trim(); if (!n || n.length > 60 || (filtro && !filtro(t))) continue;
    const k = notaClave(n); if (!k) continue;
    const x = m.get(k) || { formas:new Map(), n:0, ult:'' }; x.n++; x.formas.set(n, (x.formas.get(n) || 0) + 1); if (t.date > x.ult) x.ult = t.date; m.set(k, x);
  }
  for (const x of m.values()) x.txt = [...x.formas].sort((a, b) => b[1] - a[1])[0][0];
  return m;
}
/* la forma habitual de una nota (o la misma si es nueva) */
function notaCanon(n){ n = (n || '').trim().replace(/\s+/g, ' '); if (!n) return ''; const x = notasUsadas().get(notaClave(n)); return x ? x.txt : n; }
/* hasta 6 sugerencias para el formulario abierto */
function notasSug(){
  if (!F) return [];
  const cat = F.sub || F.parent, escrito = notaClave(F.note || '');
  const mismo = t => t.type === F.type && (!cat || t.categoryId === cat || (cat && catParentOf(t.categoryId) === cat));
  let l = [...notasUsadas(mismo).values()];
  if (l.length < 3) l = l.concat([...notasUsadas(t => t.type === F.type).values()].filter(x => !l.some(y => y.txt === x.txt)));
  const reciente = d => d >= iso(new Date(Date.now() - 90 * 864e5)) ? 2 : 1;
  return l.filter(x => x.n >= 2 && (!escrito || (notaClave(x.txt).includes(escrito) && notaClave(x.txt) !== escrito)))
    .sort((a, b) => b.n * reciente(b.ult) - a.n * reciente(a.ult) || b.ult.localeCompare(a.ult)).slice(0, 6).map(x => x.txt);
}
const catParentOf = id => { const c = cat(id); return c ? c.parentId || c.id : null; };
function notasChips(){
  const l = notasSug(); if (!l.length) return '<div class="chips nsug" id="f-nsug"></div>';
  return '<div class="chips nsug" id="f-nsug">' + l.map(n => '<button type="button" class="chip" data-nsug="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>';
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-nsug]'); if (!el || !F) return; e.stopPropagation();
  const i = $('#f-note'); F.note = el.dataset.nsug; if (i) { i.value = F.note; notaAlto(i); }
  const box = $('#f-nsug'); if (box) box.outerHTML = notasChips();
}, true);
document.addEventListener('input', e => { if (e.target.id !== 'f-note' || !F) return; F.note = e.target.value; const box = $('#f-nsug'); if (box) box.outerHTML = notasChips(); });
