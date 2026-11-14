-- Keep frequently displayed dashboard counts in small, transactionally updated
-- summary tables. This avoids repeatedly scanning leads and assignments merely
-- to render navigation badges and the four Admin Lead Master cards.

create table if not exists public.lead_database_summary_counts (
  lead_database text primary key,
  lead_count bigint not null default 0 check (lead_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.lead_database_summary_counts enable row level security;

drop policy if exists "Authenticated users read lead database summary counts" on public.lead_database_summary_counts;
create policy "Authenticated users read lead database summary counts"
  on public.lead_database_summary_counts for select to authenticated
  using (true);

create table if not exists public.lead_focused_assignment_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  focused_on date not null,
  assignment_count bigint not null default 0 check (assignment_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, focused_on)
);

alter table public.lead_focused_assignment_counts enable row level security;

drop policy if exists "Users read their focused assignment count" on public.lead_focused_assignment_counts;
create policy "Users read their focused assignment count"
  on public.lead_focused_assignment_counts for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin'));

create or replace function public.adjust_lead_database_summary_count(
  target_database text,
  delta bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_database is null or delta = 0 then
    return;
  end if;

  insert into public.lead_database_summary_counts (
    lead_database, lead_count, updated_at
  ) values (
    target_database, greatest(delta, 0), now()
  )
  on conflict (lead_database) do update
  set lead_count = greatest(0, public.lead_database_summary_counts.lead_count + delta),
      updated_at = now();
end;
$$;

create or replace function public.maintain_lead_database_summary_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.adjust_lead_database_summary_count(new.lead_database, 1);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.adjust_lead_database_summary_count(old.lead_database, -1);
    return old;
  end if;

  if new.lead_database is distinct from old.lead_database then
    perform public.adjust_lead_database_summary_count(old.lead_database, -1);
    perform public.adjust_lead_database_summary_count(new.lead_database, 1);
  end if;
  return new;
end;
$$;

create or replace function public.adjust_lead_focused_assignment_count(
  target_user_id uuid,
  target_date date,
  delta bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_user_id is null or target_date is null or delta = 0 then
    return;
  end if;

  insert into public.lead_focused_assignment_counts (
    user_id, focused_on, assignment_count, updated_at
  ) values (
    target_user_id, target_date, greatest(delta, 0), now()
  )
  on conflict (user_id, focused_on) do update
  set assignment_count = greatest(0, public.lead_focused_assignment_counts.assignment_count + delta),
      updated_at = now();
end;
$$;

create or replace function public.maintain_lead_focused_assignment_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_matches boolean := false;
  new_matches boolean := false;
begin
  if tg_op <> 'INSERT' then
    old_matches := old.is_active and old.assigned_to is not null and old.focused_on is not null;
  end if;
  if tg_op <> 'DELETE' then
    new_matches := new.is_active and new.assigned_to is not null and new.focused_on is not null;
  end if;

  if tg_op = 'UPDATE'
    and old.is_active is not distinct from new.is_active
    and old.assigned_to is not distinct from new.assigned_to
    and old.focused_on is not distinct from new.focused_on then
    return new;
  end if;

  if old_matches then
    perform public.adjust_lead_focused_assignment_count(old.assigned_to, old.focused_on, -1);
  end if;
  if new_matches then
    perform public.adjust_lead_focused_assignment_count(new.assigned_to, new.focused_on, 1);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Lock writes briefly while the starting values are built, preventing a write
-- between the backfill query and trigger activation from being missed.
lock table public.leads, public.lead_product_assignments in share row exclusive mode;

insert into public.lead_database_summary_counts (lead_database, lead_count)
values
  ('database_leads', 0),
  ('reference_leads', 0),
  ('qualified_leads', 0),
  ('leads', 0),
  ('uncategorized_leads', 0)
on conflict (lead_database) do nothing;

drop trigger if exists maintain_lead_database_summary_counts on public.leads;
create trigger maintain_lead_database_summary_counts
after insert or delete or update of lead_database on public.leads
for each row execute function public.maintain_lead_database_summary_counts();

drop trigger if exists maintain_lead_focused_assignment_counts on public.lead_product_assignments;
create trigger maintain_lead_focused_assignment_counts
after insert or delete or update of assigned_to, focused_on, is_active
on public.lead_product_assignments
for each row execute function public.maintain_lead_focused_assignment_counts();

-- Rebuild rather than increment the existing rows so rerunning this migration
-- repair script is safe and produces exact values.
update public.lead_database_summary_counts
set lead_count = 0,
    updated_at = now();

insert into public.lead_database_summary_counts (lead_database, lead_count, updated_at)
select lead_database, count(*)::bigint, now()
from public.leads
group by lead_database
on conflict (lead_database) do update
set lead_count = excluded.lead_count,
    updated_at = excluded.updated_at;

delete from public.lead_focused_assignment_counts;

insert into public.lead_focused_assignment_counts (
  user_id, focused_on, assignment_count, updated_at
)
select assigned_to, focused_on, count(*)::bigint, now()
from public.lead_product_assignments
where is_active
  and assigned_to is not null
  and focused_on is not null
group by assigned_to, focused_on;
