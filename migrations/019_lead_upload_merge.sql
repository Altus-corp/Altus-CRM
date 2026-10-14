CREATE TABLE IF NOT EXISTS uploads (
  upload_id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS merge_log (
  id TEXT PRIMARY KEY,
  lead_no TEXT,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  upload_id TEXT NOT NULL REFERENCES uploads(upload_id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS merge_conflicts (
  id TEXT PRIMARY KEY,
  lead_no TEXT,
  field TEXT NOT NULL,
  existing_value TEXT,
  incoming_value TEXT,
  upload_id TEXT NOT NULL REFERENCES uploads(upload_id),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS call_log (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_no TEXT,
  sequence_number INTEGER NOT NULL,
  called_on TEXT,
  resolution TEXT,
  remarks TEXT,
  next_call_on TEXT,
  intro_video_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  whatsapp_message_sent BOOLEAN NOT NULL DEFAULT false,
  upload_id TEXT NOT NULL REFERENCES uploads(upload_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lead_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS call_log_lead_idx ON call_log(lead_id, sequence_number DESC);
CREATE INDEX IF NOT EXISTS call_log_match_idx ON call_log(lead_id, called_on, resolution);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_status TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_called_on TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_resolution TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_call_on TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cell_no_raw TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cell_no_alt TEXT;
