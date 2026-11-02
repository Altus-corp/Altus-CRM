-- PostgreSQL runs triggers with the same timing alphabetically. The original
-- ratio trigger ran before create_initial_lead_product_assignment, so it could
-- notify a user before the product-work row existed to be assigned.

create or replace function public.assign_qualified_product_assignment_by_ratio(
  p_assignment_id uuid,
  p_notify boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  assignment_row record;
  selected_user_id uuid;
  total_weight integer;
  current_slot integer;
begin
  select assignment.id, assignment.lead_id, assignment.product_id,
    assignment.assigned_to, assignment.is_active, assignment.is_closed,
    lead.lead_database, lead.created_by, lead.external_source,
    lead.first_name, lead.last_name
  into assignment_row
  from public.lead_product_assignments assignment
  join public.leads lead on lead.id = assignment.lead_id
  where assignment.id = p_assignment_id;

  if not found
    or assignment_row.lead_database <> 'qualified_leads'
    or assignment_row.assigned_to is not null
    or not assignment_row.is_active
    or assignment_row.is_closed then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('qualified_lead_distribution'));

  select coalesce(sum(member.weight), 0)
  into total_weight
  from public.qualified_lead_distribution_members member
  join public.profiles profile on profile.id = member.user_id
  where profile.is_suspended = false
    and exists (
      select 1 from public.user_roles role
      where role.user_id = member.user_id
        and role.role::text in ('sales_executive', 'sales_manager', 'consultant')
    );
  if total_weight = 0 then return null; end if;

  update public.qualified_lead_distribution_state
  set cursor = cursor + 1, updated_at = now()
  where id = 1
  returning ((cursor - 1) % total_weight)::integer into current_slot;

  with eligible as (
    select member.user_id,
      sum(member.weight) over (order by member.position, member.user_id) as cumulative_weight
    from public.qualified_lead_distribution_members member
    join public.profiles profile on profile.id = member.user_id
    where profile.is_suspended = false
      and exists (
        select 1 from public.user_roles role
        where role.user_id = member.user_id
          and role.role::text in ('sales_executive', 'sales_manager', 'consultant')
      )
  )
  select user_id into selected_user_id
  from eligible
  where cumulative_weight > current_slot
  order by cumulative_weight
  limit 1;
  if selected_user_id is null then return null; end if;

  update public.lead_product_assignments
  set assigned_to = selected_user_id,
      assigned_at = now(),
      focused_on = (now() at time zone 'Asia/Kolkata')::date,
      assignment_origin = 'qualified_ratio',
      updated_at = now()
  where id = p_assignment_id and assigned_to is null
  returning id into p_assignment_id;
  if not found then return null; end if;

  update public.leads
  set assigned_to = selected_user_id, assigned_at = now()
  where id = assignment_row.lead_id and assigned_to is null;

  insert into public.lead_activities (
    lead_id, lead_product_assignment_id, activity_type, note, metadata, created_by
  ) values (
    assignment_row.lead_id, p_assignment_id, 'qualified_ratio_assigned',
    'Qualified lead automatically assigned by the persistent distribution ratio.',
    jsonb_build_object('assigned_to', selected_user_id, 'distribution_slot', current_slot),
    assignment_row.created_by
  );

  if p_notify and assignment_row.external_source is not null
    and to_regclass('public.crm_notifications') is not null then
    insert into public.crm_notifications (
      user_id, notification_type, title, body, href, metadata
    ) values (
      selected_user_id,
      'qualified_inbound_lead',
      'New qualified lead assigned',
      coalesce(nullif(trim(concat_ws(' ', assignment_row.first_name, assignment_row.last_name)), ''), 'A new inbound lead') || ' was assigned to you. Please contact them promptly.',
      '/dashboard/leads?view=focused',
      jsonb_build_object('lead_id', assignment_row.lead_id, 'source', assignment_row.external_source, 'priority', 'inbound')
    );
  end if;
  return selected_user_id;
end;
$$;

create or replace function public.assign_new_qualified_lead_by_ratio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare assignment_id uuid;
begin
  if new.lead_database <> 'qualified_leads' or new.assigned_to is not null then
    return new;
  end if;
  select id into assignment_id
  from public.lead_product_assignments
  where lead_id = new.id and product_id = new.product_id;
  if assignment_id is not null then
    perform public.assign_qualified_product_assignment_by_ratio(assignment_id, true);
  end if;
  return new;
end;
$$;

drop trigger if exists assign_new_qualified_lead_by_ratio_on_insert on public.leads;
drop trigger if exists z_assign_new_qualified_lead_by_ratio_on_insert on public.leads;
create trigger z_assign_new_qualified_lead_by_ratio_on_insert
after insert on public.leads
for each row execute function public.assign_new_qualified_lead_by_ratio();

-- Repair qualified leads imported while the first trigger was in the wrong
-- order. Do not send duplicate popups for those historical records.
create or replace function public.assign_pending_qualified_leads_by_ratio()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare assignment_row record;
assigned_count integer := 0;
begin
  for assignment_row in
    select assignment.id
    from public.lead_product_assignments assignment
    join public.leads lead on lead.id = assignment.lead_id
    where lead.lead_database = 'qualified_leads'
      and assignment.assigned_to is null
      and assignment.is_active = true
      and assignment.is_closed = false
    order by assignment.created_at, assignment.id
  loop
    if public.assign_qualified_product_assignment_by_ratio(assignment_row.id, false) is not null then
      assigned_count := assigned_count + 1;
    end if;
  end loop;
  return assigned_count;
end;
$$;

select public.assign_pending_qualified_leads_by_ratio();
