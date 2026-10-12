# Caudal

App personal de finanzas: lo que entra, lo que sale y lo que queda.

- `index.html`: la app (PWA). Se publica con GitHub Pages.
- `supabase/01_esquema.sql`: tablas y reglas de seguridad de la base de datos.
- `supabase/functions/ia`: lectura de texto, voz y fotos con Claude (o Gemini).
- `supabase/functions/atajo`: recibe los movimientos que envían los atajos del iPhone.

Los datos viven en Supabase y solo los ve su dueño (Row Level Security).
