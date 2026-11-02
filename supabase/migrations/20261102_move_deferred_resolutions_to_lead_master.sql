-- Deferred call outcomes leave today's Focused Leads, but remain assigned to
-- the same CRM user and therefore appear in that user's Lead Master.

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

  -- These outcomes are no longer work for today.  Do not clear assigned_to:
  -- they move from Focused Leads into the same user's Lead Master.
  if resolution_key in (
    'no busy',
    'ringing',
    'did not pick',
    'call back',
    -- tolerate common configuration variants
    'callback',
    'did not answer',
    'no answer',
    -- DNC / parked outcomes also leave active workspace
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

  -- Only Abandoned returns to the admin pool.
  if resolution_key = 'abandoned' then
    new.next_follow_up_at := null;
    new.assigned_to := null;
  end if;

  return new;
end;
$$;

-- Repair leads already marked with one of the deferred outcomes.
update public.lead_product_assignments as assignment
set
  focused_on = null,
  updated_at = now()
from public.lead_resolutions as resolution
where resolution.id = assignment.latest_resolution_id
  and lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) in (
    'no busy',
    'ringing',
    'did not pick',
    'call back',
    'callback',
    'did not answer',
    'no answer'
  )
  and assignment.focused_on is not null;
