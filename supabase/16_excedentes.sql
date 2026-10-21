-- Caudal · regla de Excedentes con techo (barrido del sobrante y pago combinado).
-- settings.exc: { on, techo, pct, ahorro (cuenta de ahorro general), desde 'AAAA-MM-DD' }.
-- Solo agrega una columna; no cambia ningún dato existente.
alter table public.settings add column if not exists exc jsonb;
