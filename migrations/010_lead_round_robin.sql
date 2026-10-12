ALTER TABLE employee_profiles ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS last_assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE assignment_rules ADD COLUMN IF NOT EXISTS rotation_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS employee_profiles_team_active_idx ON employee_profiles(team, active);

COMMENT ON COLUMN assignment_rules.conditions IS 'Lead predicates such as team, lead_type, stage, lead_status, source_system, and lead_source.';
COMMENT ON COLUMN assignment_rules.actions IS 'Pool configuration: roles, user_ids/pool, and team. Users must also be active and not offboarded.';
