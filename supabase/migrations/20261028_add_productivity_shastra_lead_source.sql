-- Allows external lead connectors to update the same CRM lead without duplicates.
alter table public.leads
  add column if not exists external_source text,
  add column if not exists external_id text;

create unique index if not exists leads_external_source_id_key
  on public.leads (external_source, external_id)
  where external_source is not null and external_id is not null;
