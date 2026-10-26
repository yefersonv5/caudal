"""Construye index.html para GitHub Pages: python3 src/build.py (desde la raíz del repo).

Une en un solo archivo: head.html, la plantilla (marcado), la hoja de estilos y
los módulos de JavaScript de src/js en el orden de ORDEN. El orden importa: cada
módulo puede usar lo que definen los anteriores al cargar la página.
"""
import os, time, json

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
read = lambda f: open(os.path.join(here, f), encoding='utf-8').read()

ORDEN = [
    'paleta.js',             # colores y tipos de movimiento
    'mmbak.js',              # lector del respaldo de Money Manager
    'nucleo.js',             # utilidades, estado y guardado
    'periodos.js', 'consultas.js',
    'inicio.js', 'analisis.js', 'cuentas.js', 'ajustes.js',
    'detalles.js', 'tooltips.js',
    'registro-ia.js', 'pagos.js', 'bandeja.js', 'respaldo.js', 'chat.js', 'eventos-secundarios.js',
    'recibos.js', 'teclado.js',
    'plan.js', 'preguntar.js', 'explorar.js', 'cuadre.js', 'asistente.js', 'tarjeta.js', 'excedentes.js', 'deudas.js', 'diapago.js', 'intereses.js', 'aprendizaje.js', 'avisos.js', 'nube.js',
    'registro.js', 'importacion.js',
    'eventos.js',            # eventos generales y arranque: siempre al final
]

build = time.strftime('%Y%m%d%H%M%S')  # versión publicada: la app se recarga sola si version.json cambia
script = '\n'.join([
    "const BUILD = '" + build + "';",
    'const SEED = ' + read('seed.generic.json').strip() + ';',
] + [read('js/' + m) for m in ORDEN])
sobran = set(os.listdir(os.path.join(here, 'js'))) - set(ORDEN)
assert not sobran, 'Módulos sin incluir en ORDEN: %s' % sobran

t = read('app.template.html').replace('__STYLES__', read('styles.css')).replace('__SCRIPT__', script)
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(read('head.html') + t + '\n</body>\n</html>\n')
open(os.path.join(root, 'version.json'), 'w').write(json.dumps({'v': build}))
print('index.html listo · versión', build)
