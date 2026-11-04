-- Moving a lead from Pre PSO/BSSO to its During stage is date-based work.
-- The former every-minute job repeatedly scanned the same assignment data and
-- became the primary source of database load. India has no DST, so 18:30 UTC
-- is midnight (00:00) Asia/Kolkata every day.

do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'altus-event-stage-transitions'
  order by jobid desc
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'altus-event-stage-transitions',
  '30 18 * * *',
  'select public.promote_scheduled_lead_stages();'
);
