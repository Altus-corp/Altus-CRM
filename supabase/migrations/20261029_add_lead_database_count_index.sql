-- Keeps the four exact Admin Leads counters fast as the CRM grows.
create index if not exists leads_lead_database_idx
  on public.leads (lead_database);
