alter table public.leads add column if not exists assigned_at timestamptz;
create index if not exists leads_assigned_at_idx on public.leads(assigned_to, assigned_at desc);
