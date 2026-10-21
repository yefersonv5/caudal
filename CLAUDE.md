# Caudal: guía para trabajar en este repo

- La app publicada es `index.html` (GitHub Pages, rama main). **No se edita a mano**: se genera con `python3 src/build.py`.
- Fuentes en `src/`: `head.html`, `app.template.html` (solo el marcado), `styles.css` (toda la hoja de estilos), `seed.generic.json` (datos de ejemplo genéricos, sin datos personales) y `js/` con la lógica en módulos: `paleta.js` (colores y tipos de movimiento), `nucleo.js` (utilidades, estado y guardado), `nube.js` (Supabase: sesión, sincronización, IA, atajos), `mmbak.js` (respaldo de Money Manager), `eventos.js` (eventos generales y arranque) y uno por sección (`inicio.js`, `analisis.js`, `registro.js`, `recibos.js`, `plan.js`...). Cada módulo abre con un comentario que dice qué contiene.
- `build.py` une los módulos en el orden de su lista `ORDEN` y falla si hay un archivo en `js/` que no está en la lista. Un módulo nuevo se agrega ahí, antes de `eventos.js`.
- Higiene: no repitas código que ya existe como utilidad (`leerPesos`, `pesosCampo`, `completarEstado`, `money`, `esc`, `TIPOS`...). Todo vive en un solo script, así que no hacen falta comprobaciones `typeof x === 'function'`.

## Sistema visual

- Concepto: banca oscura de bolsillo. Fondo gris carbón (no negro puro), superficies que se aclaran por nivel (`--surface`, `--surface-2`, `--surface-3`) y un solo color de marca, el lima `--brand`, para la acción principal y lo que entra.
- Tipos de movimiento: gasto `--out` rosa con flecha arriba y signo −, ingreso `--in` lima con flecha abajo y +, transferencia `--move` lavanda con flechas de intercambio, ajuste `--adjust` ámbar. El significado nunca depende solo del color.
- Cifras: los gastos se muestran en blanco con −; el color se reserva para ingresos, alertas y lo que se pasa del límite.
- Los colores existen en dos lugares a propósito: `styles.css` (variables) y `paleta.js` (`PAL`, `SERIE`, `TIPOS`), porque los atributos SVG no leen variables CSS. Si cambias uno, cambia el otro. No escribas colores sueltos en el JavaScript: usa `PAL`, `serieColor(i)` o `var(--...)` dentro de `style`.
- Estilos nuevos van en la sección que corresponde de `styles.css`, sin capas que sobrescriban otras.
- Logo: `src/marca/logo.svg` es la fuente (olas negras y un punto sobre el degradado lima `--hero`). Los PNG de la raíz (`icon-192`, `icon-512`, `icon-maskable`, `apple-touch-icon`) se generan con `python3 src/marca/iconos.py`; no se editan a mano. La marca de la app (`.mark` en la plantilla) usa el mismo trazo.
- El repo es público: nunca subir datos personales, llaves secretas ni respaldos. La publishable key de Supabase sí puede ir en el código.
- Backend en Supabase (proyecto `caudal`): esquema en `supabase/01_esquema.sql`, funciones en `supabase/functions/{ia,atajo,avisos,respaldo,semanal}`. Los cambios de base de datos se entregan como SQL nuevo (`supabase/02_...sql`) para correr en el SQL Editor; las funciones se actualizan pegando el código en el editor de Supabase.
- Tras cambiar `src/`, subir el número de `CACHE` en `sw.js`. `build.py` también escribe `version.json`: la app abierta compara su versión con ese archivo y se recarga sola cuando hay una nueva. Publicar siempre `index.html` y `version.json` juntos.
- Idioma de la app y de los textos: español de Colombia. Sin raya larga en los textos.
- IA: registrar usa Haiku; asistente, chat y resumen semanal usan Sonnet. El contexto grande va en `cache` (system con caché de Anthropic) y la conversación en `messages`. El asistente del día se guarda en `ia_notas` y lo comparten todos los dispositivos; no debe correr dos veces el mismo día.
