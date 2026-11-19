-- Tracks how many times in a row the Activity Resolution has been one of
-- "No Busy", "Call Back", or "Call for Next" (in any combination) for this
-- product work. Resets to 0 the moment a resolution outside that group is
-- chosen, so only an unbroken run across these three resolutions counts.
alter table public.lead_product_assignments
  add column if not exists stall_streak integer not null default 0;
