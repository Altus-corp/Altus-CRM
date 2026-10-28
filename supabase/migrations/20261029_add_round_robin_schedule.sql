create table if not exists public.lead_round_robin_schedule (
  id smallint primary key default 1 check (id = 1),
  start_time time not null default '10:30',
  end_time time not null default '15:00',
  retry_interval_minutes integer not null default 15 check (retry_interval_minutes between 5 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.lead_round_robin_schedule (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.lead_round_robin_schedule_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  ran_at timestamptz not null default now(),
  focused_count integer not null default 0,
  assigned_count integer not null default 0,
  skipped_count integer not null default 0
);

create index if not exists lead_round_robin_schedule_runs_date_ran_idx
  on public.lead_round_robin_schedule_runs (run_date, ran_at desc);

alter table public.lead_round_robin_schedule enable row level security;
alter table public.lead_round_robin_schedule_runs enable row level security;

drop policy if exists "Admins manage round robin schedule" on public.lead_round_robin_schedule;
create policy "Admins manage round robin schedule"
  on public.lead_round_robin_schedule for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "Admins read round robin schedule runs" on public.lead_round_robin_schedule_runs;
create policy "Admins read round robin schedule runs"
  on public.lead_round_robin_schedule_runs for select to authenticated
  using (public.has_role('admin'));
