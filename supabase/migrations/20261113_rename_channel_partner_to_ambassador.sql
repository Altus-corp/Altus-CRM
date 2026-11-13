-- Presentation-only rename for the Lead table. The stored relationship field
-- remains channel_partner, so existing selections and permissions are unchanged.
update public.lead_table_columns
set label = 'Ambassador'
where regexp_replace(lower(field_key), '[^a-z0-9]+', '', 'g') = 'channelpartner'
   or regexp_replace(lower(label), '[^a-z0-9]+', '', 'g') = 'channelpartner';
