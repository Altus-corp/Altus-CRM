create table if not exists public.lead_zoom_meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  zoom_meeting_id text not null unique,
  host_user_id uuid not null references auth.users(id),
  topic text not null,
  agenda text,
  start_time timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  join_url text not null,
  start_url text,
  transcript_text text,
  transcript_download_url text,
  transcript_received_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists lead_zoom_meetings_lead_start_idx
  on public.lead_zoom_meetings (lead_id, start_time desc, id desc);

alter table public.lead_zoom_meetings enable row level security;

create policy "Users read accessible lead Zoom meetings"
  on public.lead_zoom_meetings for select to authenticated
  using (exists (
    select 1 from public.leads
    where leads.id = lead_id
      and (leads.assigned_to = (select auth.uid()) or public.has_role('admin'))
  ));
