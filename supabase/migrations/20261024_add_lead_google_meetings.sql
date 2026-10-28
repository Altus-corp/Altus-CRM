create table if not exists public.lead_google_meetings (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_product_assignment_id uuid references public.lead_product_assignments(id) on delete set null,
  google_event_id text not null unique,
  host_user_id uuid not null references auth.users(id),
  topic text not null,
  description text,
  start_time timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  meet_url text not null,
  calendar_url text,
  created_at timestamptz not null default now()
);

create index if not exists lead_google_meetings_lead_start_idx on public.lead_google_meetings (lead_id, start_time desc, id desc);
alter table public.lead_google_meetings enable row level security;
create policy "Users read accessible Google meetings" on public.lead_google_meetings for select to authenticated using (
  public.has_role('admin') or exists (
    select 1 from public.lead_product_assignments assignment
    where assignment.id = lead_google_meetings.lead_product_assignment_id
      and assignment.assigned_to = (select auth.uid()) and assignment.is_active
  )
);
