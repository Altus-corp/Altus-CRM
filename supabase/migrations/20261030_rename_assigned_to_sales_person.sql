-- Rename only the user-facing Leads table heading. The assignment field remains assigned_to.
update public.lead_table_columns
set label = 'Sales Person'
where field_key = 'assigned_to';