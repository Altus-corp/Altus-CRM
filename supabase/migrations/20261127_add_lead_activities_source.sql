-- Distinguish mobile-originated activity (calls/notes/BANT edits logged from the Altus CRM mobile
-- app) from the existing web activity feed. Nullable and additive: existing rows and every current
-- write path are unaffected; only the new app/api/mobile/* routes set it.
alter table public.lead_activities
  add column if not exists source text;
