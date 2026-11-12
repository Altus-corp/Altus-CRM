-- Supports a direct Sales Manager → CRM team member relationship in addition
-- to named CRM teams. The Leads workspace reads both sources.
create table if not exists public.sales_manager_team_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  manager_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_manager_team_members_not_self check (user_id <> manager_id)
);

create index if not exists sales_manager_team_members_manager_idx
  on public.sales_manager_team_members (manager_id, user_id);

alter table public.sales_manager_team_members enable row level security;

drop policy if exists "Admins manage sales manager team members" on public.sales_manager_team_members;
create policy "Admins manage sales manager team members"
  on public.sales_manager_team_members
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
