-- Caudal · esquema de base de datos
-- Pégalo completo en Supabase → SQL Editor → New query → Run.
-- Crea las tablas y las reglas para que cada fila solo la vea y la cambie su dueño.

create extension if not exists pgcrypto;

-- Ajustes de la persona
create table if not exists public.settings (
  user_id      uuid primary key default auth.uid() references auth.users on delete cascade,
  name         text,
  start_day    smallint not null default 1 check (start_day between 1 and 28),
  rate         numeric(6,3) default 0,            -- rendimiento % E.A. de la cuenta
  last_account text,
  card_map     jsonb not null default '{}'::jsonb, -- últimos dígitos de tarjeta → cuenta
  updated_at   timestamptz not null default now()
);

create table if not exists public.accounts (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  id       text not null,
  name     text not null,
  grp      text not null default 'Otros',
  sort     int  not null default 0,
  hidden   boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.categories (
  user_id   uuid not null default auth.uid() references auth.users on delete cascade,
  id        text not null,
  name      text not null,
  emoji     text,
  type      text not null check (type in ('gasto','ingreso')),
  parent_id text,
  sort      int  not null default 0,
  hidden    boolean not null default false,
  primary key (user_id, id)
);

create table if not exists public.transactions (
  user_id       uuid not null default auth.uid() references auth.users on delete cascade,
  id            text not null,
  type          text not null check (type in ('gasto','ingreso','transferencia','ajuste')),
  amount        bigint not null,
  date          date not null,
  ts            bigint,
  account_id    text,
  to_account_id text,
  category_id   text,
  note          text,
  src           text,          -- manual, ia, banco, applepay, siri, recibo, programado...
  auto          text,          -- id del pago programado que lo generó
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists transactions_user_date on public.transactions (user_id, date desc);

create table if not exists public.budgets (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  category_id text not null,
  amount      bigint not null,
  primary key (user_id, category_id)
);

create table if not exists public.bills (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null,
  name        text not null,
  category_id text,
  account_id  text,
  due_day     smallint not null check (due_day between 1 and 31),
  lead        smallint not null default 0,
  estimate    bigint not null default 0,
  active      boolean not null default true,
  cycles      jsonb not null default '{}'::jsonb,  -- por mes: valor, llegada, pagado
  primary key (user_id, id)
);

create table if not exists public.recurring (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null,
  name        text not null,
  amount      bigint not null,
  type        text not null default 'gasto' check (type in ('gasto','ingreso')),
  day         smallint not null check (day between 1 and 31),
  category_id text,
  account_id  text,
  active      boolean not null default true,
  next        date not null,
  primary key (user_id, id)
);

-- Bandeja: lo que llega de los atajos del iPhone, pendiente de confirmar
create table if not exists public.inbox (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  id         text not null default gen_random_uuid()::text,
  raw        text,
  item       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Llave personal para los atajos (la usa la función del servidor, nunca el navegador de otros)
create table if not exists public.shortcut_tokens (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);

-- Seguridad por fila: cada tabla solo responde a su dueño
do $$
declare t text;
begin
  foreach t in array array['settings','accounts','categories','transactions','budgets','bills','recurring','inbox','shortcut_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo el dueño" on public.%I', t);
    execute format('create policy "solo el dueño" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Marca de última edición en movimientos
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions for each row execute function public.touch_updated_at();
