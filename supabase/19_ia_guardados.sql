-- ia_notas también guarda la revisión de calidad y el cierre del periodo, para volver a leerlos sin consultar a la IA. Ya aplicado.
alter table public.ia_notas drop constraint if exists ia_notas_kind_check;
alter table public.ia_notas add constraint ia_notas_kind_check check (kind in ('brief','rec','ctx','semanal','revision','cierre'));
