-- Altus Contacts' call-detail endpoint also returns AI call intelligence (summary, key points, action
-- items, sentiment, disposition, language) alongside the transcript — previously only the transcript was
-- extracted and stored; this adds columns to keep the rest too.
alter table public.lead_call_transcripts
  add column if not exists summary text,
  add column if not exists key_points jsonb not null default '[]'::jsonb,
  add column if not exists action_items jsonb not null default '[]'::jsonb,
  add column if not exists sentiment text,
  add column if not exists disposition text,
  add column if not exists language text;
