-- Qualified leads are intentionally separate from the scheduled target-based
-- round robin. This queue advances continuously; it never resets by day.
create table if not exists public.qualified_lead_distribution_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  weight integer not null check (weight between 1 and 1000),
  position integer not null check (position > 0),
  updated_at timestamptz not null default now()
);

create index if not exists qualified_lead_distribution_members_position_idx
  on public.qualified_lead_distribution_members(position);

create table if not exists public.qualified_lead_distribution_state (
  id smallint primary key default 1 check (id = 1),
  cursor bigint not null default 0 check (cursor >= 0),
  updated_at timestamptz not null default now()
);

insert into public.qualified_lead_distribution_state (id, cursor)
values (1, 0)
on conflict (id) do nothing;

alter table public.qualified_lead_distribution_members enable row level security;
alter table public.qualified_lead_distribution_state enable row level security;

drop policy if exists "Admins manage qualified lead ratio members" on public.qualified_lead_distribution_members;
create policy "Admins manage qualified lead ratio members"
  on public.qualified_lead_distribution_members for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "Admins read qualified lead ratio state" on public.qualified_lead_distribution_state;
create policy "Admins read qualified lead ratio state"
  on public.qualified_lead_distribution_state for select to authenticated
  using (public.has_role('admin'));

alter table public.lead_product_assignments
  drop constraint if exists lead_product_assignments_assignment_origin_check;

alter table public.lead_product_assignments
  add constraint lead_product_assignments_assignment_origin_check
  check (assignment_origin in ('manual', 'round_robin', 'qualified_ratio', 'released', 'import'));

create or replace function public.assign_new_qualified_lead_by_ratio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_user_id uuid;
  total_weight integer;
  current_slot integer;
begin
  -- Existing/manual ownership always wins. Only untouched qualified leads enter
  -- this persistent distribution queue.
  if new.lead_database <> 'qualified_leads' or new.assigned_to is not null then
    return new;
  end if;

  -- Serialize allocation so parallel API imports cannot give the same ratio slot
  -- to two different leads.
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

  -- An admin has not configured a ratio yet: leave the lead in the normal
  -- unassigned pool, where the existing round-robin process can still see it.
  if total_weight = 0 then
    return new;
  end if;

  update public.qualified_lead_distribution_state
  set cursor = cursor + 1, updated_at = now()
  where id = 1
  returning ((cursor - 1) % total_weight)::integer into current_slot;

  with eligible as (
    select member.user_id,
      member.weight,
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

  if selected_user_id is null then
    return new;
  end if;

  update public.lead_product_assignments
  set assigned_to = selected_user_id,
      assigned_at = now(),
      focused_on = (now() at time zone 'Asia/Kolkata')::date,
      assignment_origin = 'qualified_ratio',
      updated_at = now()
  where lead_id = new.id
    and product_id = new.product_id
    and assigned_to is null
    and is_active = true
    and is_closed = false;

  update public.leads
  set assigned_to = selected_user_id, assigned_at = now()
  where id = new.id and assigned_to is null;

  insert into public.lead_activities (
    lead_id,
    lead_product_assignment_id,
    activity_type,
    note,
    metadata,
    created_by
  )
  select assignment.lead_id,
    assignment.id,
    'qualified_ratio_assigned',
    'Qualified lead automatically assigned by the persistent distribution ratio.',
    jsonb_build_object('assigned_to', selected_user_id, 'distribution_slot', current_slot),
    new.created_by
  from public.lead_product_assignments assignment
  where assignment.lead_id = new.id and assignment.product_id = new.product_id;

  -- Website/API leads are inbound and should interrupt the assigned user right
  -- away. Manual imports stay quiet and are still visible in Focused Leads.
  if new.external_source is not null and to_regclass('public.crm_notifications') is not null then
    insert into public.crm_notifications (
      user_id,
      notification_type,
      title,
      body,
      href,
      metadata
    ) values (
      selected_user_id,
      'qualified_inbound_lead',
      'New qualified lead assigned',
      coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), 'A new inbound lead') || ' was assigned to you. Please contact them promptly.',
      '/dashboard/leads?view=focused',
      jsonb_build_object('lead_id', new.id, 'source', new.external_source, 'priority', 'inbound')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists assign_new_qualified_lead_by_ratio_on_insert on public.leads;
create trigger assign_new_qualified_lead_by_ratio_on_insert
after insert on public.leads
for each row execute function public.assign_new_qualified_lead_by_ratio();
