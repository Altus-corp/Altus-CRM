INSERT INTO dropdown_definitions (id, key, label, source_type, required, default_value, is_visible, is_active, sort_order)
VALUES ('dropdown-follow-up-filter', 'follow_up_filter', 'Follow-up filter', 'system_locked', false, NULL, true, true, 105)
ON CONFLICT (key) DO NOTHING;
