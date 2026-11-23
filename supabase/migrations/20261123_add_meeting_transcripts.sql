alter table public.lead_google_meetings add column if not exists transcript_url text;
alter table public.lead_google_meetings add column if not exists transcript_received_at timestamptz;
