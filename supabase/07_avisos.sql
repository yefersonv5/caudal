-- Avisos (notificaciones push). Ya aplicado en el proyecto.
-- La app deja programados los avisos en push_queue; la función "avisos" los envía cada 10 minutos.
create table if not exists public.push_subs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null, keys jsonb not null, created_at timestamptz not null default now(),
  primary key (user_id, endpoint));
alter table public.push_subs enable row level security;
create policy "push_subs propias" on public.push_subs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create table if not exists public.push_queue (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null, at timestamptz not null, kind text not null, title text not null, body text not null, sent_at timestamptz,
  primary key (user_id, id));
alter table public.push_queue enable row level security;
create policy "push_queue propia" on public.push_queue for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists push_queue_due on public.push_queue (at) where sent_at is null;
-- Llaves VAPID: tabla sin acceso para usuarios; solo la lee la función. Los valores NO van en el repo.
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
-- insert into public.app_secrets values ('vapid_public', '...'), ('vapid_private', '...');
create extension if not exists pg_net;
create extension if not exists pg_cron;
select cron.schedule('caudal-avisos', '*/10 * * * *', $$select net.http_post(url := 'https://mxozutrbhjucrlzgqzzz.supabase.co/functions/v1/avisos', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb, timeout_milliseconds := 20000)$$);
