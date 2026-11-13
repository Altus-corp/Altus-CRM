-- A permanent audit trail for Marketplace API use. API secrets are never
-- stored here: each entry refers only to the API-key record and its display
-- name at the moment the request was handled.
create table if not exists public.crm_marketplace_api_activity_logs (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid references public.crm_marketplace_api_keys(id) on delete set null,
  api_key_name text,
  endpoint text not null,
  method text not null check (method in ('GET', 'POST')),
  action text not null,
  service text check (service is null or service in (
    'database_leads', 'reference_leads', 'qualified_leads', 'leads'
  )),
  success boolean not null,
  status_code smallint not null check (status_code between 100 and 599),
  lead_id uuid references public.leads(id) on delete set null,
  external_id text,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists crm_marketplace_api_activity_logs_key_created_idx
  on public.crm_marketplace_api_activity_logs (api_key_id, created_at desc);

create index if not exists crm_marketplace_api_activity_logs_lead_created_idx
  on public.crm_marketplace_api_activity_logs (lead_id, created_at desc)
  where lead_id is not null;

alter table public.crm_marketplace_api_activity_logs enable row level security;

drop policy if exists "Admins read CRM marketplace API activity" on public.crm_marketplace_api_activity_logs;
create policy "Admins read CRM marketplace API activity"
  on public.crm_marketplace_api_activity_logs
  for select to authenticated
  using (public.has_role('admin'));
