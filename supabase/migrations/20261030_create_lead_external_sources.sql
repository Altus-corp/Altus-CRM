-- One CRM contact can arrive through more than one form/source over time.
-- Keep every external submission identity without overwriting the original source.
create table if not exists public.lead_external_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text not null,
  external_id text not null,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists lead_external_sources_lead_idx
  on public.lead_external_sources (lead_id, created_at desc);

insert into public.lead_external_sources (lead_id, source, external_id)
select id, external_source, external_id
from public.leads
where external_source is not null and external_id is not null
on conflict (source, external_id) do nothing;
