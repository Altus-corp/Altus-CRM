create table if not exists public.altus_contact_requests (
  request_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('dial', 'sms')),
  created_at timestamptz not null default now()
);

create index if not exists altus_contact_requests_user_created_idx on public.altus_contact_requests(user_id, created_at desc);

alter table public.altus_contact_requests enable row level security;

create policy "Users can read their Altus Contact requests"
  on public.altus_contact_requests for select
  using (auth.uid() = user_id);

create policy "Users can record their Altus Contact requests"
  on public.altus_contact_requests for insert
  with check (auth.uid() = user_id);
