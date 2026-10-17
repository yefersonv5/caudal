-- Tiempo real: la app escucha los cambios de estas tablas para sincronizar celular y navegador al instante. Ya aplicado.
-- Supabase Realtime respeta RLS: cada persona solo recibe avisos de sus propias filas.
alter publication supabase_realtime add table public.transactions, public.accounts, public.categories, public.budgets, public.bills, public.recurring, public.plans, public.settings, public.inbox;
