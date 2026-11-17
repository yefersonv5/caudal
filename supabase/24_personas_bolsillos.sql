-- Caudal · funciones traídas de la versión de Jhon: personas, bolsillos, avisos editables y apartar.
-- Solo agrega columnas opcionales y amplía una regla; no cambia ni borra ningún dato existente.
-- Son columnas nuevas en tablas existentes: conservan sus grants (authenticated y service_role, sin anon).

-- deudas en pausa: lo que debes pero no está en tus cuentas (cuenta apartada, no resta del disponible hasta pagarla)
alter table public.accounts drop constraint if exists accounts_debt_check;
alter table public.accounts add constraint accounts_debt_check check (debt in ('pagar','cobrar','pausa'));

-- bolsillos: una cuenta puede estar dentro de otra (un solo nivel, nunca tarjetas; lo controla la app)
alter table public.accounts add column if not exists parent_id text;

-- personas: con quién es la deuda o de quién es la plata
alter table public.transactions add column if not exists persona text;
-- en un préstamo, de quién era la plata que prestaste (vacío = era tuya)
alter table public.transactions add column if not exists de text;
-- enlaza los dos movimientos de un apartado para mostrarlos y borrarlos juntos
alter table public.transactions add column if not exists lig text;

-- avisos editables: la misma configuración en el celular y en el computador
alter table public.settings add column if not exists avisos jsonb;
