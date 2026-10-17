-- Asistente con memoria, metas y resumen semanal. Ya aplicado.
-- ia_notas: resumen del día compartido entre dispositivos (brief), recomendaciones con su estado (rec: nueva, hecha, no_aplica),
-- el último contexto para el resumen semanal (ctx) y el resumen semanal (semanal).
create table if not exists public.ia_notas (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null check (kind in ('brief','rec','ctx','semanal')),
  date date not null default current_date,
  sig text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'nueva' check (status in ('nueva','hecha','no_aplica')),
  updated_at timestamptz not null default now(),
  primary key (user_id, id));
alter table public.ia_notas enable row level security;
create policy "ia_notas propias" on public.ia_notas for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index if not exists ia_notas_kind on public.ia_notas (user_id, kind, date desc);
-- metas: [{id, name, monto, fecha 'AAAA-MM', acc (cuenta donde se ahorra) o ahorrado}]
alter table public.settings add column if not exists metas jsonb;
-- Resumen semanal: domingos 8:30 a. m. de Bogotá. La llave cron_key se genera en la base y NO va en el repo.
-- insert into public.app_secrets (name, value) values ('cron_key', encode(gen_random_bytes(24), 'hex'));
select cron.schedule('caudal-semanal', '30 13 * * 0', $$select net.http_post(url := 'https://mxozutrbhjucrlzgqzzz.supabase.co/functions/v1/semanal', headers := '{"Content-Type":"application/json"}'::jsonb, body := jsonb_build_object('key', (select value from public.app_secrets where name = 'cron_key')), timeout_milliseconds := 120000)$$);
