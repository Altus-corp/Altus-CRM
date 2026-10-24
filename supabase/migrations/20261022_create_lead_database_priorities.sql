create table if not exists public.lead_database_priorities (
  database_key text primary key check (database_key in ('reference_leads', 'qualified_leads', 'leads', 'database_leads')),
  label text not null,
  priority integer not null check (priority between 1 and 4),
  updated_at timestamptz not null default now()
);

alter table public.lead_database_priorities enable row level security;

drop policy if exists "Authenticated users read lead database priorities" on public.lead_database_priorities;
create policy "Authenticated users read lead database priorities"
  on public.lead_database_priorities for select to authenticated using (true);

drop policy if exists "Admins manage lead database priorities" on public.lead_database_priorities;
create policy "Admins manage lead database priorities"
  on public.lead_database_priorities for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

insert into public.lead_database_priorities (database_key, label, priority) values
  ('reference_leads', 'Reference Leads', 1),
  ('qualified_leads', 'Qualified Leads', 2),
  ('leads', 'Leads', 3),
  ('database_leads', 'Database Leads', 4)
on conflict (database_key) do nothing;
