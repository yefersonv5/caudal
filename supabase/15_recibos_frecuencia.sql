-- Caudal · recibos que no llegan cada mes (por ejemplo, el agua cada 2 meses).
-- every: cada cuántos meses vence (1 = mensual). anchor: un mes en que sí vence, 'AAAA-MM'.
-- Solo agrega columnas; no cambia ningún dato existente.
alter table public.bills add column if not exists every smallint not null default 1 check (every between 1 and 12);
alter table public.bills add column if not exists anchor text;
