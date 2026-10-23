-- Día más tardío en que suele llegar el sueldo (modo periodo según sueldo): el periodo abierto se planea hasta la víspera.
-- null = 30. Columna nueva en una tabla existente: conserva sus grants.
alter table public.settings add column if not exists pay_last smallint check (pay_last between 25 and 31);
