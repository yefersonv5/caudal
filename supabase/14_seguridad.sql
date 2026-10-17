-- Ajustes de seguridad (17 oct 2026). Ya aplicado.
-- 1. Copia de respaldo previa en un esquema privado (no expuesto a la app):
--    respaldo.settings_20261017 y respaldo.grants_20261017.
-- 2. La función "ia" solo atiende las cuentas en app_secrets.ia_usuarios (ids separados por coma).
--    El valor se llenó desde auth.users en la base; NO va en el repo.
--    insert into public.app_secrets (name, value) select 'ia_usuarios', string_agg(id::text, ',') from auth.users;
-- 3. El rol anónimo (sin sesión) ya no tiene permisos sobre las tablas; la seguridad por fila seguía activa.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
-- Para deshacer el punto 3 (si algo lo necesitara):
-- grant select, insert, update, delete, references, trigger, truncate on all tables in schema public to anon;
