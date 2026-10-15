-- Modo de periodo: null = día fijo (start_day); "sueldo" = cada periodo empieza el día en que se registra el sueldo. Ya aplicado.
alter table public.settings add column if not exists period_mode text check (period_mode in ('sueldo'));
