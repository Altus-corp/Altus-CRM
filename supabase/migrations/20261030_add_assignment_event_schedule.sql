-- A scheduled event belongs to one product assignment, not to the contact as a whole.
alter table public.lead_product_assignments
  add column if not exists scheduled_event_date date;

create index if not exists lead_product_assignments_scheduled_event_idx
  on public.lead_product_assignments (scheduled_event_date, product_id, stage_id)
  where scheduled_event_date is not null and is_active and not is_closed;
