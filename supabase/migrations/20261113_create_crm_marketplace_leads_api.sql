-- Admin-managed API credentials for external integrations that read or write
-- CRM leads. Only a SHA-256 hash of each secret is stored, so a leaked
-- database export cannot be used to call the API.
create table if not exists public.crm_marketplace_api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  key_hash text not null unique,
  key_prefix text not null,
  key_last4 text not null check (length(key_last4) = 4),
  subscriptions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(subscriptions) = 'object'),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_marketplace_api_keys_active_hash_idx
  on public.crm_marketplace_api_keys (key_hash)
  where is_active;

create index if not exists crm_marketplace_api_keys_created_at_idx
  on public.crm_marketplace_api_keys (created_at desc);

alter table public.crm_marketplace_api_keys enable row level security;

drop policy if exists "Admins manage CRM marketplace API keys" on public.crm_marketplace_api_keys;
create policy "Admins manage CRM marketplace API keys"
  on public.crm_marketplace_api_keys
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
