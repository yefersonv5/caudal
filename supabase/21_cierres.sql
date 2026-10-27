-- Caudal · estado del día de pago por periodo: settings.cierres = { 'AAAA-MM-DD' (inicio del periodo): { cerrado:'AAAA-MM-DD', dia:true, extra:true } }.
-- Cuando un mes queda cerrado, la lista del día de pago no vuelve a pedir nada en ningún dispositivo.
-- Columna nueva en una tabla existente: conserva sus grants.
alter table public.settings add column if not exists cierres jsonb;
