create table if not exists public.lead_table_columns (
  id uuid primary key default gen_random_uuid(),
  field_key text not null unique,
  label text not null,
  source text not null check (source in ('standard', 'product', 'stage', 'resolution', 'custom')),
  is_visible boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists lead_table_columns_position_idx
  on public.lead_table_columns(position);

alter table public.lead_table_columns enable row level security;

drop policy if exists "Authenticated users read lead table columns" on public.lead_table_columns;
create policy "Authenticated users read lead table columns"
  on public.lead_table_columns for select to authenticated using (true);

drop policy if exists "Admins manage lead table columns" on public.lead_table_columns;
create policy "Admins manage lead table columns"
  on public.lead_table_columns for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

insert into public.lead_table_columns (field_key, label, source, position) values
  ('lead_name', 'Lead name', 'standard', 1),
  ('phone', 'Cell Number', 'standard', 2),
  ('email', 'Email address', 'standard', 3),
  ('product', 'Product', 'product', 4),
  ('stage', 'Stage', 'stage', 5),
  ('call_resolution', 'Activity resolution', 'resolution', 6),
  ('assigned_to', 'Sales Person', 'standard', 7),
  ('next_follow_up', 'Next follow-up', 'standard', 8),
  ('created_at', 'Created at', 'standard', 9)
on conflict (field_key) do nothing;
