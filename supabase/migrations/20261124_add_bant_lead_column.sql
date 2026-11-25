-- BANT (Budget / Authority / Need / Timeline) is a system column with four sub-dropdowns rather than a
-- plain scalar field, so it needs its own `source` value instead of being created as a generic 'custom'
-- column. Each sub-value is written to leads.custom_data (bant_b/bant_a/bant_n/bant_t) by a dedicated
-- server action (updateLeadBantField), same convention as the 'resolution' system column.
alter table public.lead_table_columns
  drop constraint if exists lead_table_columns_source_check,
  add constraint lead_table_columns_source_check
    check (source in ('standard', 'product', 'stage', 'resolution', 'custom', 'bant'));

-- Hidden from the Leads table by default: a table cell can only show one value, and BANT is four. It still
-- shows up in Column Management (toggleable) and always renders its full 4-dropdown UI on the lead itself.
insert into public.lead_table_columns (field_key, label, source, position, is_visible)
values ('bant', 'BANT', 'bant', 1000, false)
on conflict (field_key) do nothing;
