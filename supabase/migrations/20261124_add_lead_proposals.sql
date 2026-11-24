create table if not exists public.lead_proposals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_product_assignment_id uuid not null references public.lead_product_assignments(id) on delete cascade,
  file_url text not null,
  file_name text not null,
  file_mime text,
  file_size bigint,
  details text,
  approved boolean not null default false,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists lead_proposals_lead_idx on public.lead_proposals (lead_id, created_at desc);

alter table public.lead_proposals enable row level security;

-- Reads are scoped by the app's own API route (same assigned/team/admin rule as everywhere else); writes only
-- ever happen through server actions using the service-role client after their own permission check, same
-- convention as crm_targets / crm_hygiene_rules, so authenticated-select-only is sufficient here.
drop policy if exists "crm2 read lead proposals" on public.lead_proposals;
create policy "crm2 read lead proposals" on public.lead_proposals for select to authenticated using (true);
