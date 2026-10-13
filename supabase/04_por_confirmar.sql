-- Movimientos "por confirmar": registros aproximados que se revisan después (ya aplicado en el proyecto).
alter table public.transactions add column if not exists pending boolean not null default false;
