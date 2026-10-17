# Caudal: guía para trabajar en este repo

- La app publicada es `index.html` (GitHub Pages, rama main). **No se edita a mano**: se genera con `python3 src/build.py`.
- Fuentes en `src/`: `app.template.html` (interfaz, estilos y lógica), `cloud.js` (Supabase: sesión, sincronización, IA, atajos), `importer.js` (respaldo .mmbak de Money Manager), `seed.generic.json` (datos de ejemplo genéricos, sin datos personales), `head.html`.
- El repo es público: nunca subir datos personales, llaves secretas ni respaldos. La publishable key de Supabase sí puede ir en el código.
- Backend en Supabase (proyecto `caudal`): esquema en `supabase/01_esquema.sql`, funciones en `supabase/functions/{ia,atajo,avisos,respaldo,semanal}`. Los cambios de base de datos se entregan como SQL nuevo (`supabase/02_...sql`) para correr en el SQL Editor; las funciones se actualizan pegando el código en el editor de Supabase.
- Tras cambiar `src/`, subir el número de `CACHE` en `sw.js`. `build.py` también escribe `version.json`: la app abierta compara su versión con ese archivo y se recarga sola cuando hay una nueva. Publicar siempre `index.html` y `version.json` juntos.
- Idioma de la app y de los textos: español de Colombia. Sin raya larga en los textos.
- IA: registrar usa Haiku; asistente, chat y resumen semanal usan Sonnet. El contexto grande va en `cache` (system con caché de Anthropic) y la conversación en `messages`. El asistente del día se guarda en `ia_notas` y lo comparten todos los dispositivos; no debe correr dos veces el mismo día.
