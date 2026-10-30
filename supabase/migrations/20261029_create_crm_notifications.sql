create table if not exists public.crm_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null default 'lead_assigned',
  title text not null,
  body text,
  href text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists crm_notifications_user_unread_idx
  on public.crm_notifications (user_id, created_at desc)
  where read_at is null;

alter table public.crm_notifications enable row level security;

drop policy if exists "Users read own CRM notifications" on public.crm_notifications;
create policy "Users read own CRM notifications"
  on public.crm_notifications for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users update own CRM notifications" on public.crm_notifications;
create policy "Users update own CRM notifications"
  on public.crm_notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
