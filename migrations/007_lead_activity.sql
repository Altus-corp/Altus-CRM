CREATE TABLE IF NOT EXISTS lead_notes (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  note_type TEXT NOT NULL CHECK (note_type IN ('call','manual')),
  call_id TEXT REFERENCES lead_calls(id) ON DELETE SET NULL,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_followup_events (
  id TEXT PRIMARY KEY,
  followup_id TEXT NOT NULL REFERENCES lead_followups(id) ON DELETE CASCADE,
  old_due_at TIMESTAMPTZ,
  new_due_at TIMESTAMPTZ,
  changed_by TEXT REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lead_calls ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE lead_calls ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE lead_calls ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE lead_followups ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

CREATE INDEX IF NOT EXISTS lead_notes_lead_created_idx ON lead_notes(lead_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS lead_followup_events_followup_idx ON lead_followup_events(followup_id, changed_at DESC, id DESC);

ALTER TABLE lead_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_followup_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON lead_notes, lead_followup_events FROM anon, authenticated;
