-- Caudal · clave de acceso de 4 dígitos, la misma en todos los dispositivos.
-- settings.pin = { salt, hash, iter }: PBKDF2-SHA256 de la clave. La clave nunca se guarda en claro.
-- Columna nueva en una tabla existente: conserva sus grants.
alter table public.settings add column if not exists pin jsonb;
