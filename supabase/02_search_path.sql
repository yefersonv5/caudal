-- Caudal · ajuste de seguridad recomendado por Supabase (aplicado el 2026-10-12)
alter function public.touch_updated_at() set search_path = '';
