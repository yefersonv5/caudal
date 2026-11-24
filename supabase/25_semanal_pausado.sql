-- Resumen semanal a pedido (23 nov 2026). Ya aplicado.
-- El resumen de los domingos deja de enviarse solo: se pide en el chat del Asistente
-- ("¿Cómo me fue esta semana?"). La tarea queda pausada, no borrada.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'caudal-semanal'), active := false);

-- Para volver a activarlo:
-- select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'caudal-semanal'), active := true);
