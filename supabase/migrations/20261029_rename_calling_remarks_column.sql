-- Presentation-only rename: existing values remain in the same custom field.
update public.lead_table_columns
set label = 'Activity Remarks'
where lower(trim(label)) in ('calling remark', 'calling remarks', 'activity remark');
