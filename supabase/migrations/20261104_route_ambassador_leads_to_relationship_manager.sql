-- An Ambassador's relationship manager is the CRM owner from the latest lead
-- shared with that Ambassador. Keep that ownership explicitly so new leads
-- entered by the Ambassador can go straight to the correct CRM user.
create table if not exists public.ambassador_relationship_managers (
  ambassador_id uuid primary key references auth.users(id) on delete cascade,
  crm_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.ambassador_relationship_managers enable row level security;

drop policy if exists "Admins manage Ambassador relationship managers" on public.ambassador_relationship_managers;
create policy "Admins manage Ambassador relationship managers"
  on public.ambassador_relationship_managers
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- Seed the relationship from existing Channel Partner selections. The newest
-- active CRM ownership wins if an Ambassador was previously shared by more
-- than one sales user.
insert into public.ambassador_relationship_managers (ambassador_id, crm_user_id, assigned_by, updated_at)
select distinct on (partner.ambassador_id)
  partner.ambassador_id,
  assignment.assigned_to,
  partner.assigned_by,
  now()
from public.lead_channel_partners partner
join public.lead_product_assignments assignment
  on assignment.lead_id = partner.lead_id
 and assignment.is_active
 and not assignment.is_closed
 and assignment.assigned_to is not null
join public.user_roles role
  on role.user_id = assignment.assigned_to
 and role.role in ('sales_executive', 'sales_manager', 'consultant')
order by partner.ambassador_id, partner.assigned_at desc, assignment.assigned_at desc nulls last, assignment.id desc
on conflict (ambassador_id) do update
set crm_user_id = excluded.crm_user_id,
    assigned_by = excluded.assigned_by,
    updated_at = now();

create or replace function public.capture_ambassador_relationship_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  manager_id uuid;
begin
  select assignment.assigned_to
    into manager_id
  from public.lead_product_assignments assignment
  join public.user_roles role
    on role.user_id = assignment.assigned_to
   and role.role in ('sales_executive', 'sales_manager', 'consultant')
  where assignment.lead_id = new.lead_id
    and assignment.is_active
    and not assignment.is_closed
    and assignment.assigned_to is not null
  order by assignment.assigned_at desc nulls last, assignment.id desc
  limit 1;

  if manager_id is not null then
    insert into public.ambassador_relationship_managers (ambassador_id, crm_user_id, assigned_by, updated_at)
    values (new.ambassador_id, manager_id, new.assigned_by, now())
    on conflict (ambassador_id) do update
    set crm_user_id = excluded.crm_user_id,
        assigned_by = excluded.assigned_by,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists capture_ambassador_relationship_manager on public.lead_channel_partners;
create trigger capture_ambassador_relationship_manager
after insert or update of lead_id, ambassador_id on public.lead_channel_partners
for each row execute function public.capture_ambassador_relationship_manager();

-- Keep the Ambassador as the Channel Partner, but route the working
-- assignment to their saved Relationship Manager. If no manager has ever been
-- assigned, preserve the earlier safe fallback: the Ambassador owns the lead.
create or replace function public.mark_ambassador_import()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  manager_id uuid;
begin
  if tg_op = 'INSERT' then
    new.ambassador_imported_by := null;
    if exists (
      select 1 from public.user_roles
      where user_id = new.created_by and role::text = 'ambassador'
    ) and not exists (
      select 1 from public.user_roles
      where user_id = new.created_by and role::text = 'admin'
    ) then
      new.ambassador_imported_by := new.created_by;

      select crm_user_id into manager_id
      from public.ambassador_relationship_managers
      where ambassador_id = new.created_by;

      new.assigned_to := coalesce(manager_id, new.created_by);
      new.assigned_at := now();
    end if;
  else
    new.ambassador_imported_by := old.ambassador_imported_by;
  end if;
  return new;
end;
$$;

-- The dedicated Channel Partner row gives the Ambassador access to their own
-- submitted lead while the CRM user remains the actual Sales Person.
create or replace function public.share_ambassador_import_with_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.ambassador_imported_by is not null then
    insert into public.lead_channel_partners (
      lead_id, ambassador_id, assigned_by, focused_on
    )
    values (
      new.id,
      new.ambassador_imported_by,
      new.ambassador_imported_by,
      (now() at time zone 'Asia/Kolkata')::date
    )
    on conflict (lead_id, ambassador_id) do update
    set focused_on = excluded.focused_on;
  end if;
  return new;
end;
$$;

drop trigger if exists share_ambassador_import_with_creator on public.leads;
create trigger share_ambassador_import_with_creator
after insert on public.leads
for each row execute function public.share_ambassador_import_with_creator();

-- Apply the routed owner to secondary product assignments as well, including
-- bulk-uploaded Additional Product columns. These records remain excluded from
-- round robin and appear in the Relationship Manager's Focused Leads today.
create or replace function public.protect_ambassador_import_from_round_robin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  importer uuid;
  manager_id uuid;
begin
  select ambassador_imported_by, assigned_to
    into importer, manager_id
  from public.leads
  where id = new.lead_id;

  new.exclude_from_round_robin := importer is not null;
  if importer is not null then
    if new.assignment_origin = 'round_robin' then
      raise exception 'Ambassador imports cannot enter round robin.';
    end if;

    if new.assigned_to is null or new.assigned_to = importer then
      new.assigned_to := manager_id;
      new.assigned_at := coalesce(new.assigned_at, now());
    end if;

    if new.assigned_to is not null then
      new.focused_on := (now() at time zone 'Asia/Kolkata')::date;
    end if;
  end if;
  return new;
end;
$$;
