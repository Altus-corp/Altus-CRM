alter table public.lead_table_columns
  add column if not exists field_type public.lead_field_type not null default 'text',
  add column if not exists options jsonb not null default '[]'::jsonb,
  add column if not exists is_required boolean not null default false;
