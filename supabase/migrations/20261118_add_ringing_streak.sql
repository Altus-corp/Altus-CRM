-- Tracks how many times in a row the Activity Resolution has been set to
-- "Ringing" for this product work. Resets to 0 the moment any other
-- resolution is chosen, so only back-to-back Ringing calls count.
alter table public.lead_product_assignments
  add column if not exists ringing_streak integer not null default 0;
