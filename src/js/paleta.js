/* ---------- paleta y tema (claro u oscuro) ----------
   Las gráficas SVG y las leyendas no pueden leer las variables de styles.css
   en sus atributos, así que los colores viven aquí con los mismos valores,
   uno por tema. Si cambias un color, cámbialo en los dos lugares.
   El tema elegido se guarda solo en este dispositivo (caudal.tema): auto, claro u oscuro.
   head.html ya lo aplica antes de pintar para que no parpadee. */
/* Todos los colores con significado son los de MonAi, medidos sobre sus capturas oficiales
   (App Store y get-monai.app), y son los mismos en los dos temas; solo cambian tinta y fondos.
   MonAi no tiene transferencias ni ajustes: van con su gris y su naranja */
const MONAI = { verde:'#5F8A4A', rojo:'#F05C50', amarillo:'#F4D068', naranja:'#F4A656', azul:'#CAE6FC', durazno:'#FCA060', gris:'#A8A6A5' };
const PALETAS = {
  oscuro:{ ...MONAI, tinta:'#FFFFFF', superficie:'#1C1C1E', fondo:'#000000', velo:a => 'rgba(255,255,255,' + a + ')' },
  claro:{ ...MONAI, tinta:'#141414', superficie:'#FFFFFF', fondo:'#F8F8F8', velo:a => 'rgba(0,0,0,' + a + ')' }
};
const PAL = {};   // colores del tema activo; se llenan en aplicarTema
const SERIE = []; // orden fijo para series, cuentas y categorías: verde primero, gris al final, todos de MonAi
const serieColor = i => SERIE[i % SERIE.length];
const TEMAS = [['auto', 'Automático'], ['claro', 'Claro'], ['oscuro', 'Oscuro']];
const temaPref = () => { try { return localStorage.getItem('caudal.tema') || 'auto'; } catch (e) { return 'auto'; } };
const TEMA_MQ = matchMedia('(prefers-color-scheme: light)');
/* aplica el tema: guarda la preferencia, marca <html data-tema> y deja PAL y SERIE con sus colores */
function aplicarTema(pref){
  if (pref) try { localStorage.setItem('caudal.tema', pref); } catch (e) {}
  const p = pref || temaPref(), t = p === 'auto' ? (TEMA_MQ.matches ? 'claro' : 'oscuro') : p;
  document.documentElement.dataset.tema = t;
  Object.assign(PAL, PALETAS[t]);
  SERIE.splice(0, SERIE.length, PAL.verde, PAL.amarillo, PAL.rojo, PAL.azul, PAL.naranja, PAL.durazno, PAL.gris);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = PAL.fondo;
}
aplicarTema();
/* tono pastel del círculo de cada emoji (los ocho de MonAi): sale del orden de la categoría principal,
   así categorías vecinas nunca repiten color; lo que no es categoría (recibos) usa su id */
function tonoDe(k){
  let i = S.categories.filter(c => !c.parentId).findIndex(c => c.id === k);
  if (i < 0) { i = 0; for (const ch of String(k || '')) i = (i * 31 + ch.charCodeAt(0)) | 0; }
  return ' data-tono="' + (Math.abs(i) % 8) + '"';
}

/* tipos de movimiento: nombre, títulos del registro y flecha (como Retirar, Recargar e Intercambiar) */
const TIPOS = {
  gasto:{ nombre:'Gasto', corto:'Gasto', nuevo:'Nuevo gasto', editar:'Editar gasto', signo:'−', icono:'<path d="M12 19V5M6 11l6-6 6 6"/>' },
  ingreso:{ nombre:'Ingreso', corto:'Ingreso', nuevo:'Nuevo ingreso', editar:'Editar ingreso', signo:'+', icono:'<path d="M12 5v14M6 13l6 6 6-6"/>' },
  transferencia:{ nombre:'Transferencia', corto:'Transferir', nuevo:'Nueva transferencia', editar:'Editar transferencia', signo:'', icono:'<path d="M4 8h14l-4-4M20 16H6l4 4"/>' },
  ajuste:{ nombre:'Ajuste', corto:'Ajuste', nuevo:'Nuevo ajuste', editar:'Editar ajuste', signo:'±', icono:'<path d="M5 12h14M12 5v14"/>' }
};
const tipoIcono = (k, s) => '<svg width="' + (s || 18) + '" height="' + (s || 18) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TIPOS[k].icono + '</svg>';
