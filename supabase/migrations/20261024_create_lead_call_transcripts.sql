create table if not exists public.lead_call_transcripts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  altus_call_id text not null unique,
  transcript_text text not null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_call_transcripts_lead_created_idx
  on public.lead_call_transcripts (lead_id, created_at desc, id desc);

alter table public.lead_call_transcripts enable row level security;

create policy "Users read accessible lead call transcripts"
  on public.lead_call_transcripts for select to authenticated
  using (exists (
    select 1 from public.leads
    where leads.id = lead_id
      and (leads.assigned_to = (select auth.uid()) or public.has_role('admin'))
  ));
