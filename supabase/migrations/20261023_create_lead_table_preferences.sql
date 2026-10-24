create table if not exists public.lead_table_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  column_order jsonb not null default '[]'::jsonb,
  column_widths jsonb not null default '{}'::jsonb,
  frozen_column_keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.lead_table_preferences enable row level security;
create policy "Users manage own lead table preferences" on public.lead_table_preferences for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
