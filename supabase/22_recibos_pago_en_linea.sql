-- Recibos: enlace del sitio de pago y número de cuenta o contrato del servicio.
alter table public.bills add column if not exists url text, add column if not exists ref text;
