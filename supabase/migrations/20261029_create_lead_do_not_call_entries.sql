create table if not exists public.lead_do_not_call_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_product_assignment_id uuid not null references public.lead_product_assignments(id) on delete cascade,
  resolution_id uuid not null references public.lead_resolutions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lead_product_assignment_id)
);

create index if not exists lead_do_not_call_entries_user_created_idx
  on public.lead_do_not_call_entries (user_id, created_at desc);

alter table public.lead_do_not_call_entries enable row level security;

drop policy if exists "Users manage own do not call entries" on public.lead_do_not_call_entries;
create policy "Users manage own do not call entries"
  on public.lead_do_not_call_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Managers read all do not call entries" on public.lead_do_not_call_entries;
create policy "Managers read all do not call entries"
  on public.lead_do_not_call_entries for select to authenticated
  using (exists (select 1 from public.user_roles where user_roles.user_id = (select auth.uid()) and user_roles.role in ('admin', 'sales_manager')));
