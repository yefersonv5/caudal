-- Caudal · deudas sin personas: dos cuentas en el grupo "Deudas" que la app crea al primer uso.
-- accounts.debt: 'pagar' (te prestaron o pagaron por ti; resta del disponible) o 'cobrar' (prestaste; apartada).
-- Solo agrega una columna; no cambia ningún dato existente.
alter table public.accounts add column if not exists debt text check (debt in ('pagar','cobrar'));
