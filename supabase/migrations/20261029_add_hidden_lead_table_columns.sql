-- Per-user hidden columns. Admin-level visibility remains controlled by lead_table_columns.is_visible.
alter table public.lead_table_preferences
  add column if not exists hidden_column_keys text[] not null default '{}';
