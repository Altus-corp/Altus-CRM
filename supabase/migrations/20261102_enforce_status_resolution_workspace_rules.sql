-- Keep terminal / parked resolutions out of a sales user's active workspace.
-- This is intentionally enforced in Postgres so inline edits, imports, and
-- any future API integration all follow the same rule.

create or replace function public.apply_resolution_workspace_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution_key text;
begin
  if new.latest_resolution_id is null then
    return new;
  end if;

  select lower(regexp_replace(trim(name), '[,_[:space:]-]+', ' ', 'g'))
    into resolution_key
  from public.lead_resolutions
  where id = new.latest_resolution_id;

  -- Assigned ownership is deliberately retained for every outcome below.
  -- Only today's Focused Leads placement is cleared.
  if resolution_key in (
    'dnd',
    'not interested',
    'lost',
    'i will get back',
    'wrong number',
    'old graduate',
    'abandoned'
  ) then
    new.focused_on := null;
  end if;

  -- An abandoned lead returns to the admin pool and cannot keep a follow-up.
  if resolution_key = 'abandoned' then
    new.next_follow_up_at := null;
    new.assigned_to := null;
  end if;

  return new;
end;
$$;

drop trigger if exists lead_product_assignment_resolution_workspace_rules
  on public.lead_product_assignments;

create trigger lead_product_assignment_resolution_workspace_rules
before insert or update of latest_resolution_id
on public.lead_product_assignments
for each row
execute function public.apply_resolution_workspace_rules();

-- Repair work that was marked before the trigger existed.  The expression
-- normalizes case, punctuation, and whitespace (e.g. "I will get Back").
update public.lead_product_assignments as assignment
set
  focused_on = null,
  next_follow_up_at = case
    when lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) = 'abandoned'
      then null
    else assignment.next_follow_up_at
  end,
  assigned_to = case
    when lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) = 'abandoned'
      then null
    else assignment.assigned_to
  end,
  updated_at = now()
from public.lead_resolutions as resolution
where resolution.id = assignment.latest_resolution_id
  and lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) in (
    'dnd',
    'not interested',
    'lost',
    'i will get back',
    'wrong number',
    'old graduate',
    'abandoned'
  )
  and (
    assignment.focused_on is not null
    or (
      lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) = 'abandoned'
      and (assignment.assigned_to is not null or assignment.next_follow_up_at is not null)
    )
  );
