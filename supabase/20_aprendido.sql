-- ia_notas guarda también lo que el asistente aprende de la persona (kind 'aprendido'). Ya aplicado.
alter table public.ia_notas drop constraint if exists ia_notas_kind_check;
alter table public.ia_notas add constraint ia_notas_kind_check check (kind in ('brief','rec','ctx','semanal','revision','cierre','aprendido'));
