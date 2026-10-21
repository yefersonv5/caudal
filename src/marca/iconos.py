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
sangre = svg.replace(' rx="22"', '')  # fondo cuadrado completo
# zona segura: el dibujo (todo lo que va después del fondo) se reduce al 80 % y se centra
fondo = re.search(r'<rect[^>]*/>', sangre).group(0)
cabeza, dibujo = sangre.split(fondo)
segura = cabeza + fondo + '<g transform="translate(10 10) scale(.8)">' + dibujo.replace('</svg>', '') + '</g></svg>'

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
