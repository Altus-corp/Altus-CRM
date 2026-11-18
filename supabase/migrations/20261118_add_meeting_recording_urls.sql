alter table public.lead_zoom_meetings add column if not exists recording_url text;
alter table public.lead_google_meetings add column if not exists recording_url text;
