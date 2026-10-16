ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS actions JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS last_assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS rotation_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS assignment_rules_enabled_priority_idx
  ON assignment_rules(enabled, priority, name);
