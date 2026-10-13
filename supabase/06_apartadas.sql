-- Cuentas apartadas: no suman en el disponible (ya aplicado en el proyecto).
alter table public.accounts add column if not exists apart boolean not null default false;
