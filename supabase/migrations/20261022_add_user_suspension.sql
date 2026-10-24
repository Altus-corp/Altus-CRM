alter table public.profiles
  add column if not exists is_suspended boolean not null default false;
