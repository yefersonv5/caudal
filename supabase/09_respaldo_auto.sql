-- Fecha del último respaldo automático (la escribe la función respaldo). Ya aplicado.
alter table public.settings add column if not exists backup_at timestamptz;
