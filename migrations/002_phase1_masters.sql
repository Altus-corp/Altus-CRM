-- Phase 1 admin masters. This migration is explicit and is not run by the server.
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_connected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_no_answer BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_ringing BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_dnd BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE master_values ADD COLUMN IF NOT EXISTS is_final BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_targets ADD COLUMN IF NOT EXISTS week_start DATE;
ALTER TABLE user_targets ADD COLUMN IF NOT EXISTS quarter_start DATE;
ALTER TABLE user_targets ADD COLUMN IF NOT EXISTS absent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE user_targets ADD COLUMN IF NOT EXISTS day_override INTEGER;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  field TEXT,
  old_value TEXT,
  new_value TEXT,
  ip TEXT
);
CREATE TABLE IF NOT EXISTS master_values (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, master_type TEXT NOT NULL, code TEXT,
  label TEXT NOT NULL, colour TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true, value JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_connected BOOLEAN NOT NULL DEFAULT false, is_no_answer BOOLEAN NOT NULL DEFAULT false,
  is_ringing BOOLEAN NOT NULL DEFAULT false, is_dnd BOOLEAN NOT NULL DEFAULT false,
  is_follow_up BOOLEAN NOT NULL DEFAULT false, is_final BOOLEAN NOT NULL DEFAULT false,
  source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_targets (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, user_id TEXT REFERENCES users(id),
  target_date DATE, weekday INTEGER, week_start DATE, quarter_start DATE,
  non_keynote_target INTEGER NOT NULL DEFAULT 0, keynote_target INTEGER NOT NULL DEFAULT 0,
  total_target INTEGER NOT NULL DEFAULT 0, day_override INTEGER, week_override INTEGER, quarter_override INTEGER,
  absent BOOLEAN NOT NULL DEFAULT false, source_checksum TEXT,
  import_run_id TEXT REFERENCES import_runs(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workspace_settings (
  setting_key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true, updated_by TEXT REFERENCES users(id), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assignment_rules (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, name TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true, conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '{}'::jsonb, rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS template_categories (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, name TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
  source_checksum TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS admin_templates (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, category_id TEXT REFERENCES template_categories(id), category TEXT,
  name TEXT NOT NULL, channel TEXT, subject TEXT, body TEXT, media_type TEXT, media_url TEXT,
  language TEXT, sequence INTEGER NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1, source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_catalog (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, name TEXT NOT NULL, provider TEXT,
  enabled BOOLEAN NOT NULL DEFAULT false, status TEXT, source_checksum TEXT,
  import_run_id TEXT REFERENCES import_runs(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS employee_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id), serial TEXT, cell TEXT, products JSONB NOT NULL DEFAULT '[]'::jsonb,
  backup_user_id TEXT REFERENCES users(id), lead_transfer_allowed BOOLEAN NOT NULL DEFAULT false, colour TEXT,
  source_id TEXT UNIQUE, active BOOLEAN NOT NULL DEFAULT true, offboarded_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS lead_products (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, lead_id TEXT NOT NULL, product_code TEXT NOT NULL,
  stage TEXT, source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, lead_id TEXT NOT NULL, paid BOOLEAN NOT NULL DEFAULT false,
  registered_at TIMESTAMPTZ, amount NUMERIC, source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY, source_id TEXT UNIQUE, lead_id TEXT NOT NULL, amount NUMERIC NOT NULL,
  paid_at TIMESTAMPTZ, mode TEXT, note TEXT, source_checksum TEXT, import_run_id TEXT REFERENCES import_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS master_values_type_active_idx ON master_values(master_type, active, sort_order);
CREATE INDEX IF NOT EXISTS user_targets_user_date_idx ON user_targets(user_id, target_date);
CREATE INDEX IF NOT EXISTS user_targets_week_idx ON user_targets(user_id, week_start);
CREATE INDEX IF NOT EXISTS assignment_rules_enabled_priority_idx ON assignment_rules(enabled, priority);
CREATE INDEX IF NOT EXISTS admin_templates_category_sequence_idx ON admin_templates(category, sequence, active);
CREATE INDEX IF NOT EXISTS lead_products_lead_product_idx ON lead_products(lead_id, product_code);
CREATE INDEX IF NOT EXISTS registrations_lead_idx ON registrations(lead_id, registered_at DESC);
CREATE INDEX IF NOT EXISTS payments_lead_date_idx ON payments(lead_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_time_idx ON audit_log(action, occurred_at DESC);

INSERT INTO workspace_settings(setting_key, value) VALUES
  ('back_to_back_no_answer_threshold', '5'::jsonb),
  ('ringing_attempts_threshold', '10'::jsonb),
  ('back_to_back_dnd_threshold', '4'::jsonb),
  ('keep_alive_frequencies_days', '[7,10,15]'::jsonb),
  ('max_videos_per_call', '3'::jsonb),
  ('reconfirmation_days_before', '1'::jsonb),
  ('reconfirmation_minutes_before', '30'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;
