"""Construye index.html para GitHub Pages: python3 src/build.py (desde la raíz del repo).

Une en un solo archivo: head.html, la plantilla, la hoja de estilos, la paleta,
los datos de ejemplo, el importador y los módulos de lógica.
"""
import os, time, json

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
read = lambda f: open(os.path.join(here, f), encoding='utf-8').read()

# módulos que se insertan antes de la hoja de registro, en este orden
MODULOS = ['plan.js', 'ask.js', 'explore.js', 'cuadre.js', 'asistente.js', 'tarjeta.js', 'avisos.js', 'cloud.js']

build = time.strftime('%Y%m%d%H%M%S')  # versión publicada: la app se recarga sola si version.json cambia
t = (read('app.template.html')
     .replace('__STYLES__', read('styles.css'))
     .replace('__PALETA__', read('paleta.js'))
     .replace('__SEED__', read('seed.generic.json'))
     .replace('__IMPORTER__', read('importer.js')))
corte = t.index('/* ---------- hoja de registro')
t = t[:corte] + "const BUILD = '" + build + "';\n" + '\n'.join(read(m) for m in MODULOS) + '\n' + t[corte:]

open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(read('head.html') + t + '\n</body>\n</html>\n')
open(os.path.join(root, 'version.json'), 'w').write(json.dumps({'v': build}))
print('index.html listo · versión', build)
