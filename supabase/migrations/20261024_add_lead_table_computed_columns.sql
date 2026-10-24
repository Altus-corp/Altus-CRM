-- Display-only columns can derive their value from stored lead fields.
-- They are excluded from CSV templates because they are never imported.
alter table public.lead_table_columns
  add column if not exists computed_from text[] not null default '{}';

create index if not exists lead_table_columns_computed_from_idx
  on public.lead_table_columns using gin (computed_from);
