-- Stores the administrator-selected type for activities logged from the lead drawer.
-- Existing notes remain unchanged and are intentionally not backfilled here.
ALTER TABLE lead_notes
  ADD COLUMN IF NOT EXISTS activity_type_option_id TEXT,
  ADD COLUMN IF NOT EXISTS activity_type_label TEXT;

INSERT INTO dropdown_definitions (id, key, label, source_type, required, default_value, is_visible, is_active, sort_order)
VALUES ('dropdown-activity-type', 'activity_type', 'Activity type', 'managed', true, 'phone_call', true, true, 210)
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
VALUES
  ('dropdown-option-activity-type-phone-call', 'dropdown-activity-type', 'Phone call', 'phone_call', NULL, 10, true),
  ('dropdown-option-activity-type-meeting-demo', 'dropdown-activity-type', 'Meeting / Demo', 'meeting_demo', NULL, 20, true),
  ('dropdown-option-activity-type-email-follow-up', 'dropdown-activity-type', 'Email follow-up', 'email_follow_up', NULL, 30, true),
  ('dropdown-option-activity-type-whatsapp-message', 'dropdown-activity-type', 'WhatsApp message', 'whatsapp_message', NULL, 40, true),
  ('dropdown-option-activity-type-site-visit', 'dropdown-activity-type', 'Site visit', 'site_visit', NULL, 50, true),
  ('dropdown-option-activity-type-proposal-review', 'dropdown-activity-type', 'Proposal review', 'proposal_review', NULL, 60, true),
  ('dropdown-option-activity-type-product-walkthrough', 'dropdown-activity-type', 'Product walkthrough', 'product_walkthrough', NULL, 70, true),
  ('dropdown-option-activity-type-internal-note', 'dropdown-activity-type', 'Internal note', 'internal_note', NULL, 80, true)
ON CONFLICT (dropdown_id, value) DO NOTHING;
