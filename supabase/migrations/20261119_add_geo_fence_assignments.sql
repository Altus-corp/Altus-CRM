-- Admin-configured login geofence per CRM user. A user with an active row
-- here can only sign in when their browser-reported location is within
-- radius_meters of (center_lat, center_lng); users with no row, or an
-- inactive one, are unrestricted.
create table if not exists public.geo_fence_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  label text,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_meters integer not null check (radius_meters > 0),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists geo_fence_assignments_user_idx on public.geo_fence_assignments (user_id);

alter table public.geo_fence_assignments enable row level security;

create policy "Admins manage geo fence assignments"
  on public.geo_fence_assignments for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
