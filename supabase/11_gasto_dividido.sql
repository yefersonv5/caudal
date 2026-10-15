-- Gasto dividido: las partes de un mismo gasto comparten grp. Ya aplicado.
alter table public.transactions add column if not exists grp text;
