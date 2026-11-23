"""Genera los íconos de la app desde logo.svg: python3 src/marca/iconos.py (desde la raíz del repo).

- icon-192.png, icon-512.png y apple-touch-icon.png van a sangre (sin esquinas): el sistema las redondea.
- icon-maskable.png deja el dibujo en el 80 % central, la zona segura de Android.
Usa Playwright (Chromium) solo para rasterizar el SVG.
"""
import os, re, asyncio
from playwright.async_api import async_playwright

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(os.path.dirname(here))
svg = re.sub(r'<!--.*?-->', '', open(os.path.join(here, 'logo.svg'), encoding='utf-8').read(), flags=re.S).strip()
sangre = svg.replace(' rx="22"', '')  # fondo y brillo cuadrados completos: el sistema redondea
sangre = re.sub(r'<rect x="1"[^>]*/>', '', sangre)  # el filo de luz solo tiene sentido con las esquinas del dibujo
# zona segura: las olas y el punto se reducen al 80 % y se centran; el fondo y su brillo cubren todo
fondo = re.search(r'<rect[^>]*/>', sangre).group(0)
cabeza, dibujo = sangre.split(fondo, 1)
brillo = re.match(r'\s*<rect[^>]*/>', dibujo).group(0)
dibujo = dibujo[len(brillo):]
segura = cabeza + fondo + brillo + '<g transform="translate(10 10) scale(.8)">' + dibujo.replace('</svg>', '') + '</g></svg>'

SALIDAS = [('icon-192.png', 192, sangre), ('icon-512.png', 512, sangre), ('apple-touch-icon.png', 180, sangre), ('icon-maskable.png', 512, segura)]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for nombre, lado, fuente in SALIDAS:
            pg = await b.new_page(viewport={'width': lado, 'height': lado})
            await pg.set_content('<style>html,body{margin:0}svg{display:block;width:%dpx;height:%dpx}</style>%s' % (lado, lado, fuente))
            await pg.screenshot(path=os.path.join(root, nombre), omit_background=False)
            await pg.close()
            print('listo', nombre, lado)
        await b.close()

asyncio.run(main())
