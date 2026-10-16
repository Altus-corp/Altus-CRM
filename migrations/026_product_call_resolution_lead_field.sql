-- Calling Resolution is one field, but its options are owned by each product.
-- Convert existing workspace configuration to the product-linked dropdown mode.
UPDATE workspace_settings
SET value = (
  SELECT jsonb_agg(
    CASE WHEN field.value->>'key' = 'calling_resolution'
      THEN field.value || jsonb_build_object('type', 'dropdown', 'options', '[]'::jsonb, 'product_resolutions', true)
      ELSE field.value
    END
    ORDER BY field.ordinality
  )
  FROM jsonb_array_elements(value) WITH ORDINALITY AS field(value, ordinality)
)
WHERE setting_key = 'lead_field_definitions'
  AND active = true
  AND jsonb_typeof(value) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(value) AS field(value)
    WHERE field.value->>'key' = 'calling_resolution'
  );
