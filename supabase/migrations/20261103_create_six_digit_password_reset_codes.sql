-- Custom SMTP reset codes are six digits (instead of Supabase's recovery
-- token). Codes are hashed, expire after a short period, and can be used only
-- once to create a temporary HTTP-only password-reset session.
create table if not exists public.crm_password_reset_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  verified_at timestamptz,
  verified_token_hash text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.crm_password_reset_codes enable row level security;
-- No browser policies: only server actions using the Supabase service key may
-- issue, verify, or consume these password-reset records.
