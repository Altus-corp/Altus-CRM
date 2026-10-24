alter table public.leads
  add column if not exists lead_database text not null default 'leads'
  check (lead_database in ('leads', 'reference_leads', 'qualified_leads', 'database_leads'));

create index if not exists leads_database_created_idx
  on public.leads(lead_database, created_at desc, id desc);
