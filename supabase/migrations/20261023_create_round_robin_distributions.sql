create table if not exists public.lead_round_robin_distributions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reference_leads_weight integer not null default 1 check (reference_leads_weight between 0 and 1000),
  qualified_leads_weight integer not null default 1 check (qualified_leads_weight between 0 and 1000),
  leads_weight integer not null default 1 check (leads_weight between 0 and 1000),
  database_leads_weight integer not null default 1 check (database_leads_weight between 0 and 1000),
  updated_at timestamptz not null default now()
);

alter table public.lead_round_robin_distributions enable row level security;

drop policy if exists "Admins manage lead round robin distributions" on public.lead_round_robin_distributions;
create policy "Admins manage lead round robin distributions"
  on public.lead_round_robin_distributions for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
