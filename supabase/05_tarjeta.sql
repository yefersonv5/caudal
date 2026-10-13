-- Modelo de tarjeta de crédito (ya aplicado en el proyecto).
-- accounts.card: {pocket: id del bolsillo con que se paga, cut: día de corte, due: día de pago}
-- transactions.fund: bolsillo que paga una compra hecha con tarjeta (si no es el de la tarjeta)
alter table public.accounts add column if not exists card jsonb;
alter table public.transactions add column if not exists fund text;
