"""Construye index.html para GitHub Pages: python3 src/build.py (desde la raíz del repo)."""
import os, time, json
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
r = lambda f: open(os.path.join(here, f), encoding='utf-8').read()
build = time.strftime('%Y%m%d%H%M%S')  # versión publicada: la app se recarga sola si version.json cambia
t = r('app.template.html').replace('__SEED__', r('seed.generic.json')).replace('__IMPORTER__', r('importer.js'))
c = t.index('/* ---------- hoja de registro')
t = t[:c] + "const BUILD = '" + build + "';\n" + r('plan.js') + '\n' + r('ask.js') + '\n' + r('cloud.js') + '\n' + t[c:]
head = r('head.html')
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(head + t + '\n</body>\n</html>\n')
open(os.path.join(root, 'version.json'), 'w').write(json.dumps({'v': build}))
print('index.html listo · versión', build)
