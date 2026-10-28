-- Backfill any records that entered before the lead-number default was active.
with current_max as (
  select greatest(coalesce(max(lead_number), 10000), 10000) as value
  from public.leads
), missing_numbers as (
  select lead.id, current_max.value + row_number() over (order by lead.created_at, lead.id) as number
  from public.leads lead
  cross join current_max
  where lead.lead_number is null
)
update public.leads lead
set lead_number = missing_numbers.number
from missing_numbers
where lead.id = missing_numbers.id;

select setval(
  'public.lead_number_sequence',
  greatest(coalesce((select max(lead_number) from public.leads), 10000), 10000),
  true
);
