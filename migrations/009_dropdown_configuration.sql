CREATE TABLE IF NOT EXISTS dropdown_definitions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'managed' CHECK (source_type IN ('managed', 'system_locked', 'api_backed')),
  required BOOLEAN NOT NULL DEFAULT false,
  default_value TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dropdown_options (
  id TEXT PRIMARY KEY,
  dropdown_id TEXT NOT NULL REFERENCES dropdown_definitions(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  semantic_key TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dropdown_id, value),
  CHECK (length(btrim(label)) > 0),
  CHECK (length(btrim(value)) > 0)
);

CREATE INDEX IF NOT EXISTS dropdown_definitions_visibility_idx ON dropdown_definitions(is_active, is_visible, sort_order, key);
CREATE INDEX IF NOT EXISTS dropdown_options_order_idx ON dropdown_options(dropdown_id, is_active, sort_order, id);

CREATE OR REPLACE FUNCTION prevent_dropdown_option_value_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.value IS DISTINCT FROM OLD.value THEN
    RAISE EXCEPTION 'dropdown option value is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dropdown_option_value_immutable ON dropdown_options;
CREATE TRIGGER dropdown_option_value_immutable
BEFORE UPDATE ON dropdown_options
FOR EACH ROW EXECUTE FUNCTION prevent_dropdown_option_value_change();

INSERT INTO dropdown_definitions (id, key, label, source_type, required, default_value, is_visible, is_active, sort_order)
VALUES
  ('dropdown-lead-type', 'lead_type', 'Lead type', 'managed', true, 'DL', true, true, 10),
  ('dropdown-lead-stage', 'lead_stage', 'Lead stage', 'managed', true, 'lead', true, true, 20),
  ('dropdown-permission', 'permission', 'Permission To Call', 'system_locked', true, 'Pending', true, true, 30),
  ('dropdown-related-activity', 'related_activity', 'Related activity', 'managed', false, 'None', true, true, 40),
  ('dropdown-note-visibility', 'note_visibility', 'Note visibility', 'system_locked', true, 'Team', true, true, 50),
  ('dropdown-notify-before', 'notify_before', 'Notify before', 'managed', false, '15 minutes before', true, true, 60),
  ('dropdown-join-operator', 'filter_join_operator', 'Filter join operator', 'system_locked', true, 'AND', true, true, 70),
  ('dropdown-filter-field', 'filter_field', 'Filter field', 'system_locked', true, 'name', true, true, 80),
  ('dropdown-filter-operator', 'filter_operator', 'Filter operator', 'system_locked', true, 'contains', true, true, 90),
  ('dropdown-page-size', 'page_size', 'Rows per page', 'system_locked', true, '50', true, true, 100),
  ('dropdown-follow-up-filter', 'follow_up_filter', 'Follow-up filter', 'system_locked', false, NULL, true, true, 105),
  ('dropdown-role', 'role', 'Role', 'system_locked', true, 'Sales', true, true, 110),
  ('dropdown-master-type', 'master_type', 'Master type', 'system_locked', true, 'resolution', true, true, 120),
  ('dropdown-weekday', 'weekday', 'Weekday', 'system_locked', true, '1', true, true, 130),
  ('dropdown-workspace-setting', 'workspace_setting_key', 'Workspace setting', 'system_locked', true, NULL, true, true, 140),
  ('dropdown-assignee', 'assignee', 'Assignee', 'api_backed', false, NULL, true, true, 150),
  ('dropdown-employee', 'employee', 'Employee', 'api_backed', false, NULL, true, true, 160),
  ('dropdown-backup-person', 'backup_person', 'Backup person', 'api_backed', false, NULL, true, true, 170),
  ('dropdown-replacement-owner', 'replacement_owner', 'Replacement owner', 'api_backed', false, NULL, true, true, 180),
  ('dropdown-reminder-recipient', 'reminder_recipient', 'Reminder recipient', 'api_backed', false, NULL, true, true, 190),
  ('dropdown-target-salesperson', 'target_salesperson', 'Target salesperson', 'api_backed', true, NULL, true, true, 200)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  source_type = EXCLUDED.source_type,
  required = EXCLUDED.required,
  default_value = EXCLUDED.default_value,
  is_visible = EXCLUDED.is_visible,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO dropdown_options (id, dropdown_id, label, value, semantic_key, sort_order, is_active)
SELECT
  'dropdown-option-master-' || mv.id,
  dd.id,
  mv.label,
  COALESCE(NULLIF(mv.code, ''), mv.id),
  CASE WHEN mv.master_type IN ('stage', 'leadstage') THEN COALESCE(NULLIF(mv.code, ''), mv.id) ELSE NULL END,
  mv.sort_order,
  mv.active
FROM master_values mv
JOIN dropdown_definitions dd ON dd.key = CASE
  WHEN mv.master_type IN ('stage', 'leadstage') THEN 'lead_stage'
  WHEN mv.master_type IN ('lead_type', 'leadtype') THEN 'lead_type'
  ELSE NULL
END
ON CONFLICT (dropdown_id, value) DO NOTHING;
