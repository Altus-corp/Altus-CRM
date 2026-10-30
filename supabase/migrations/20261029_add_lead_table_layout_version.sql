alter table public.lead_table_preferences
  add column if not exists layout_version integer not null default 0;
