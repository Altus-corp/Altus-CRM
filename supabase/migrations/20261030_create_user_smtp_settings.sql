create table if not exists public.user_smtp_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  host text not null,
  port integer not null default 587 check (port between 1 and 65535),
  username text not null,
  from_email text not null,
  from_name text,
  password_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- Passwords are encrypted by the server. No client policies are created, so the table is
-- reachable only through server actions that use the service-role key.
alter table public.user_smtp_settings enable row level security;
