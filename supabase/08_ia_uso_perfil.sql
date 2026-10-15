-- Consumo de IA, perfil del usuario y saldo de créditos (ya aplicado en el proyecto).
create table if not exists public.ia_usage (user_id uuid not null references auth.users on delete cascade, at timestamptz not null default now(), task text, model text, inp int, outp int, usd numeric(10,5) not null default 0, error text);
alter table public.ia_usage enable row level security;
create policy "ia_usage propia" on public.ia_usage for select to authenticated using (user_id = auth.uid());
create index if not exists ia_usage_user_at on public.ia_usage (user_id, at desc);
alter table public.settings add column if not exists perfil text;
alter table public.settings add column if not exists ia_saldo jsonb;
