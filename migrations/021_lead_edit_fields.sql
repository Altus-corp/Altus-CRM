-- Ensure the fields used by the structured Lead Edit form are recognized by
-- the JSONB lead-field store, including workspaces with saved definitions.
WITH defaults (field_key, field_label, field_type, field_order) AS (
  VALUES
    ('last_called_on', 'Last Called On', 'text', 14),
    ('calling_resolution', 'Calling Resolution', 'text', 15),
    ('next_call_on', 'Next Call On', 'text', 16),
    ('calling_remarks', 'Calling Remarks', 'textarea', 17),
    ('intro_video_sent', '2 Mins Intro Video Sent', 'boolean', 18),
    ('email_sent', 'Email Sent', 'boolean', 19),
    ('whatsapp_message_sent', 'Msg Sent on WhatsApp', 'boolean', 20)
), existing AS (
  SELECT value->>'key' AS field_key, value AS field, ord::numeric AS field_order
  FROM workspace_settings ws
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(ws.value) = 'array' THEN ws.value ELSE '[]'::jsonb END) WITH ORDINALITY AS item(value, ord)
  WHERE ws.setting_key = 'lead_field_definitions'
), merged AS (
  SELECT field_key, field, field_order FROM existing
  UNION ALL
  SELECT d.field_key,
    jsonb_build_object('key', d.field_key, 'label', d.field_label, 'type', d.field_type, 'active', true, 'detail_visible', true, 'order', d.field_order),
    d.field_order
  FROM defaults d
  WHERE NOT EXISTS (SELECT 1 FROM existing e WHERE e.field_key = d.field_key)
), payload AS (
  SELECT COALESCE(jsonb_agg(field ORDER BY field_order, field_key), '[]'::jsonb) AS value
  FROM merged
)
UPDATE workspace_settings ws
SET value = payload.value, active = true, updated_at = now()
FROM payload
WHERE ws.setting_key = 'lead_field_definitions';
