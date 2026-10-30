-- Display name only: keep the existing field key and call-resolution workflow unchanged.
update public.lead_table_columns
set label = 'Activity Resolution'
where field_key = 'call_resolution';
