-- Prerequisite: 20261030_add_assignment_event_schedule.sql.
-- Supabase Cron runs even when the CRM server is offline.
begin;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.promote_scheduled_lead_stages()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  event_date date := (now() at time zone 'Asia/Kolkata')::date;
  promoted integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('altus_scheduled_lead_stages', 0));
  with eligible as (
    select a.id, pre.name as pre_name, during.name as during_name, during.id as during_id
    from public.lead_product_assignments a
    join public.lead_products p on p.id = a.product_id
    join public.lead_stages pre on pre.id = a.stage_id and pre.product_id = p.id
    join public.lead_stages during on during.product_id = p.id
    where upper(btrim(p.code)) in ('PSO', 'BSSO')
      and lower(regexp_replace(btrim(pre.name), '\s+', ' ', 'g')) = 'pre ' || lower(btrim(p.code))
      and lower(regexp_replace(btrim(during.name), '\s+', ' ', 'g')) = 'during ' || lower(btrim(p.code))
      and pre.is_active and during.is_active
      and a.scheduled_event_date = event_date
      and a.is_active and not a.is_closed
  ), moved as (
    update public.lead_product_assignments a
    set stage_id = e.during_id
    from eligible e where a.id = e.id
    returning a.id, a.lead_id, a.assigned_to, a.created_by, e.pre_name, e.during_name
  ), logged as (
    insert into public.lead_activities
      (lead_id, lead_product_assignment_id, activity_type, note, metadata, created_by)
    select m.lead_id, m.id, 'stage_updated',
      format('Automatically moved from %s to %s for the scheduled event date (%s).', m.pre_name, m.during_name, event_date),
      jsonb_build_object('automated', true, 'source', 'scheduled_event_stage_transition',
        'from_stage', m.pre_name, 'to_stage', m.during_name, 'scheduled_event_date', event_date),
      coalesce(m.assigned_to, m.created_by)
    from moved m where coalesce(m.assigned_to, m.created_by) is not null
    returning id
  )
  select count(*) into promoted from moved;
  return jsonb_build_object('ok', true, 'date', event_date, 'promoted', promoted,
    'message', format('%s scheduled lead product assignments moved to their During stage.', promoted));
end;
$$;
revoke all on function public.promote_scheduled_lead_stages() from public, anon, authenticated;
grant execute on function public.promote_scheduled_lead_stages() to service_role;

-- Includes midnight IST, retries failures, and catches event-day imports.
-- Future dates and past event dates remain untouched.
-- Reapplying updates this named job rather than duplicating it.
select cron.schedule('altus-event-stage-transitions', '* * * * *',
  'select public.promote_scheduled_lead_stages();');

-- Process today's due leads immediately on installation, too.
select public.promote_scheduled_lead_stages();
commit;
