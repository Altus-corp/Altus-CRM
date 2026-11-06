-- A Junior Ambassador inherits the CRM owner of their own Ambassador record.
-- When that record has not yet been assigned directly, use the Senior
-- Ambassador's owner. This keeps every lead entered by a Junior Ambassador in
-- the correct CRM user's queue instead of leaving it with the Ambassador.

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

-- Resolve the current CRM owner from the most specific source first:
-- the Ambassador record itself, then its saved relationship manager, then the
-- Senior Ambassador's current owner. Only real CRM sales roles can be chosen.
create or replace function public.resolve_ambassador_sales_owner(target_ambassador_id uuid)
returns uuid
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if target_ambassador_id is null then
    return null;
  end if;

  select assignment.assigned_to
    into owner_id
  from public.lead_product_assignments assignment
  join public.user_roles role
    on role.user_id = assignment.assigned_to
   and role.role::text in ('sales_executive', 'sales_manager', 'consultant')
  where assignment.is_ambassador
    and assignment.is_active
    and assignment.ambassador_user_id = target_ambassador_id
    and assignment.assigned_to is not null
  order by assignment.updated_at desc nulls last, assignment.id desc
  limit 1;
  if owner_id is not null then
    return owner_id;
  end if;

  select manager.crm_user_id
    into owner_id
  from public.ambassador_relationship_managers manager
  join public.user_roles role
    on role.user_id = manager.crm_user_id
   and role.role::text in ('sales_executive', 'sales_manager', 'consultant')
  where manager.ambassador_id = target_ambassador_id;
  if owner_id is not null then
    return owner_id;
  end if;

  select coalesce(
      (
        select senior_assignment.assigned_to
        from public.lead_product_assignments senior_assignment
        join public.user_roles senior_role
          on senior_role.user_id = senior_assignment.assigned_to
         and senior_role.role::text in ('sales_executive', 'sales_manager', 'consultant')
        where senior_assignment.is_ambassador
          and senior_assignment.is_active
          and senior_assignment.ambassador_user_id = hierarchy.senior_ambassador_id
          and senior_assignment.assigned_to is not null
        order by senior_assignment.updated_at desc nulls last, senior_assignment.id desc
        limit 1
      ),
      (
        select senior_manager.crm_user_id
        from public.ambassador_relationship_managers senior_manager
        join public.user_roles senior_role
          on senior_role.user_id = senior_manager.crm_user_id
         and senior_role.role::text in ('sales_executive', 'sales_manager', 'consultant')
        where senior_manager.ambassador_id = hierarchy.senior_ambassador_id
      )
    )
    into owner_id
  from public.ambassador_hierarchy hierarchy
  where hierarchy.junior_ambassador_id = target_ambassador_id;

  return owner_id;
end;
$$;

-- Save the inherited owner when the Senior -> Junior relationship is created
-- or changed. The resolver above remains the source of truth for new leads,
-- so later owner changes are also honoured.
create or replace function public.sync_junior_ambassador_relationship_manager()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  owner_id := public.resolve_ambassador_sales_owner(new.senior_ambassador_id);
  if owner_id is not null then
    insert into public.ambassador_relationship_managers (
      ambassador_id, crm_user_id, assigned_by, updated_at
    ) values (
      new.junior_ambassador_id, owner_id, new.assigned_by, now()
    )
    on conflict (ambassador_id) do update
    set crm_user_id = excluded.crm_user_id,
        assigned_by = excluded.assigned_by,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_junior_ambassador_relationship_manager on public.ambassador_hierarchy;
create trigger sync_junior_ambassador_relationship_manager
after insert or update of senior_ambassador_id on public.ambassador_hierarchy
for each row execute function public.sync_junior_ambassador_relationship_manager();

-- Backfill every existing Junior Ambassador with the owner resolved from their
-- own record or their Senior Ambassador.
insert into public.ambassador_relationship_managers (
  ambassador_id, crm_user_id, updated_at
)
select hierarchy.junior_ambassador_id, owner.owner_id, now()
from public.ambassador_hierarchy hierarchy
cross join lateral (
  select public.resolve_ambassador_sales_owner(hierarchy.junior_ambassador_id) as owner_id
) owner
where owner.owner_id is not null
on conflict (ambassador_id) do update
set crm_user_id = excluded.crm_user_id,
    updated_at = now();

-- Replace the original import trigger implementation. It now resolves the
-- Junior Ambassador's CRM owner at insert time instead of assuming only a
-- pre-existing relationship-manager row can provide it.
create or replace function public.mark_ambassador_import()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
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
      owner_id := public.resolve_ambassador_sales_owner(new.created_by);
      new.assigned_to := coalesce(owner_id, new.created_by);
      new.assigned_at := now();
    end if;
  else
    new.ambassador_imported_by := old.ambassador_imported_by;
  end if;
  return new;
end;
$$;

-- Secondary product assignments follow the same resolved sales owner.
create or replace function public.protect_ambassador_import_from_round_robin()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  importer_id uuid;
  owner_id uuid;
begin
  select ambassador_imported_by, assigned_to
    into importer_id, owner_id
  from public.leads
  where id = new.lead_id;

  new.exclude_from_round_robin := importer_id is not null;
  if importer_id is not null then
    if new.assignment_origin = 'round_robin' then
      raise exception 'Ambassador imports cannot enter round robin.';
    end if;

    if owner_id is null or owner_id = importer_id then
      owner_id := public.resolve_ambassador_sales_owner(importer_id);
    end if;

    if new.assigned_to is null or new.assigned_to = importer_id then
      new.assigned_to := coalesce(owner_id, importer_id);
      new.assigned_at := coalesce(new.assigned_at, now());
    end if;

    if new.assigned_to is not null then
      new.focused_on := (now() at time zone 'Asia/Kolkata')::date;
    end if;
  end if;
  return new;
end;
$$;

-- Repair leads and active product work that were previously left assigned to
-- a Junior Ambassador instead of their CRM sales owner.
with routed_leads as (
  select lead.id,
         lead.ambassador_imported_by,
         public.resolve_ambassador_sales_owner(lead.ambassador_imported_by) as owner_id
  from public.leads lead
  where lead.ambassador_imported_by is not null
)
update public.leads lead
set assigned_to = routed.owner_id,
    assigned_at = coalesce(lead.assigned_at, now()),
    updated_at = now()
from routed_leads routed
where lead.id = routed.id
  and routed.owner_id is not null
  and routed.owner_id <> routed.ambassador_imported_by
  and (lead.assigned_to is null or lead.assigned_to = routed.ambassador_imported_by);

update public.lead_product_assignments assignment
set assigned_to = lead.assigned_to,
    assigned_at = coalesce(assignment.assigned_at, lead.assigned_at, now()),
    focused_on = coalesce(assignment.focused_on, (now() at time zone 'Asia/Kolkata')::date),
    updated_at = now()
from public.leads lead
where lead.id = assignment.lead_id
  and lead.ambassador_imported_by is not null
  and lead.assigned_to is not null
  and lead.assigned_to <> lead.ambassador_imported_by
  and (assignment.assigned_to is null or assignment.assigned_to = lead.ambassador_imported_by);
