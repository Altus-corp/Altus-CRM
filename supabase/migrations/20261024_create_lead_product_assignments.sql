-- A contact is stored once in leads.  Each product worked for that contact has
-- its own assignment, owner, status and activity trail.
create table if not exists public.lead_product_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  product_id uuid not null references public.lead_products(id),
  stage_id uuid references public.lead_stages(id) on delete set null,
  latest_resolution_id uuid references public.lead_resolutions(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  assigned_at timestamptz,
  next_follow_up_at timestamptz,
  is_closed boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, product_id)
);

create index if not exists lead_product_assignments_assignee_idx
  on public.lead_product_assignments(assigned_to, assigned_at desc, id desc);
create index if not exists lead_product_assignments_lead_idx
  on public.lead_product_assignments(lead_id, product_id);

-- Keep every existing lead available immediately after this migration.
insert into public.lead_product_assignments
  (lead_id, product_id, stage_id, latest_resolution_id, assigned_to, assigned_at, next_follow_up_at, is_closed, created_by)
select id, product_id, stage_id, latest_resolution_id, assigned_to, assigned_at, next_follow_up_at, is_closed, created_by
from public.leads
where product_id is not null
on conflict (lead_id, product_id) do nothing;

-- New imports still write the legacy product fields during the transition.
-- This trigger creates the first product work record automatically.
create or replace function public.create_initial_lead_product_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.product_id is not null then
    insert into public.lead_product_assignments
      (lead_id, product_id, stage_id, latest_resolution_id, assigned_to, assigned_at, next_follow_up_at, is_closed, created_by)
    values
      (new.id, new.product_id, new.stage_id, new.latest_resolution_id, new.assigned_to, new.assigned_at, new.next_follow_up_at, new.is_closed, new.created_by)
    on conflict (lead_id, product_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_initial_lead_product_assignment_on_insert on public.leads;
create trigger create_initial_lead_product_assignment_on_insert
after insert on public.leads
for each row execute function public.create_initial_lead_product_assignment();

alter table public.lead_product_assignments enable row level security;

create policy "Admins manage lead product assignments"
  on public.lead_product_assignments for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "Users read their lead product assignments"
  on public.lead_product_assignments for select to authenticated
  using (assigned_to = (select auth.uid()));

create policy "Users update their lead product assignments"
  on public.lead_product_assignments for update to authenticated
  using (assigned_to = (select auth.uid()))
  with check (assigned_to = (select auth.uid()));

alter table public.lead_activities
  add column if not exists lead_product_assignment_id uuid references public.lead_product_assignments(id) on delete cascade;

create index if not exists lead_activities_assignment_created_idx
  on public.lead_activities(lead_product_assignment_id, created_at desc, id desc);

-- Existing history belongs to the initial product assignment.
update public.lead_activities activity
set lead_product_assignment_id = assignment.id
from public.lead_product_assignments assignment
where assignment.lead_id = activity.lead_id
  and activity.lead_product_assignment_id is null
  and assignment.product_id = (select product_id from public.leads where id = activity.lead_id)
  and not exists (
    select 1 from public.lead_product_assignments duplicate
    where duplicate.lead_id = assignment.lead_id
      and duplicate.product_id = assignment.product_id
      and duplicate.id < assignment.id
  );

drop policy if exists "Users read assigned leads or admins read all" on public.leads;
create policy "Users read assigned product leads or admins read all" on public.leads for select to authenticated using (
  public.has_role('admin')
  or exists (
    select 1 from public.lead_product_assignments assignment
    where assignment.lead_id = leads.id and assignment.assigned_to = (select auth.uid()) and assignment.is_active
  )
);

drop policy if exists "Users update assigned leads or admins update all" on public.leads;
create policy "Users update accessible leads or admins update all" on public.leads for update to authenticated using (
  public.has_role('admin')
  or exists (
    select 1 from public.lead_product_assignments assignment
    where assignment.lead_id = leads.id and assignment.assigned_to = (select auth.uid()) and assignment.is_active
  )
) with check (
  public.has_role('admin')
  or exists (
    select 1 from public.lead_product_assignments assignment
    where assignment.lead_id = leads.id and assignment.assigned_to = (select auth.uid()) and assignment.is_active
  )
);

drop policy if exists "Users read activities for accessible leads" on public.lead_activities;
create policy "Users read activities for accessible product assignments" on public.lead_activities for select to authenticated using (
  public.has_role('admin') or exists (
    select 1 from public.lead_product_assignments assignment
    where assignment.id = lead_activities.lead_product_assignment_id
      and assignment.assigned_to = (select auth.uid()) and assignment.is_active
  )
);

drop policy if exists "Users create activities for accessible leads" on public.lead_activities;
create policy "Users create activities for accessible product assignments" on public.lead_activities for insert to authenticated with check (
  created_by = (select auth.uid()) and (
    public.has_role('admin') or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.id = lead_activities.lead_product_assignment_id
        and assignment.assigned_to = (select auth.uid()) and assignment.is_active
    )
  )
);
