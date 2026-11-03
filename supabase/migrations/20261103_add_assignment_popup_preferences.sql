-- Each CRM user can permanently silence assignment popups without losing the
-- normal notification bell/history. This prevents a large lead batch from
-- producing one modal per lead.
create table if not exists public.crm_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  assignment_popups_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.crm_notification_preferences enable row level security;

drop policy if exists "Users read own CRM notification preferences" on public.crm_notification_preferences;
create policy "Users read own CRM notification preferences"
  on public.crm_notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users update own CRM notification preferences" on public.crm_notification_preferences;
create policy "Users update own CRM notification preferences"
  on public.crm_notification_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
