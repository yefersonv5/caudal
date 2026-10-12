-- Caudal · plan del mes (presupuesto unificado)
-- Una fila por versión del plan; los rubros van en items (jsonb):
-- [{ id, name, amount, cls: 'Ahorro'|'Esenciales'|'No esenciales', cats: [category_id], acc: account_id }]
-- Rubro con cats = se cumple gastando en esas categorías; sin cats = se cumple transfiriendo a acc.

create table if not exists public.plans (
  user_id         uuid not null default auth.uid() references auth.users on delete cascade,
  id              text not null,
  name            text,
  income          bigint not null default 0,
  start           date not null,
  from_account    text,
  surplus_account text,
  items           jsonb not null default '[]'::jsonb,
  primary key (user_id, id)
);

alter table public.plans enable row level security;
drop policy if exists "solo el dueño" on public.plans;
create policy "solo el dueño" on public.plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
