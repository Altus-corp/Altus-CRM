-- Repair existing status-work rows that were already focused before those
-- statuses were excluded from Lead Master and Focused Leads.
update public.lead_product_assignments assignment
set focused_on = null,
    next_follow_up_at = case
      when lower(regexp_replace(resolution.name, '[,_-]+', ' ', 'g')) in ('dnd', 'not interested', 'lost', 'i will get back', 'wrong number', 'old graduate', 'abandoned')
        then null
      else assignment.next_follow_up_at
    end,
    updated_at = now()
from public.lead_resolutions resolution
where resolution.id = assignment.latest_resolution_id
  and lower(regexp_replace(resolution.name, '[,_-]+', ' ', 'g')) in (
    'dnd', 'not interested', 'lost', 'i will get back', 'wrong number', 'old graduate', 'abandoned'
  )
  and assignment.focused_on is not null;
