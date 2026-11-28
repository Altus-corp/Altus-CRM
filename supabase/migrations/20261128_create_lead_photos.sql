-- A contact's photo is keyed by their normalized phone number (public.normalize_lead_phone), same identity
-- key leads.phone_key already uses — so one photo shows for every lead/product assignment that shares that
-- phone number, not just the one it was uploaded from.
create table if not exists public.lead_photos (
  phone_key text primary key,
  photo_url text not null,
  updated_at timestamptz not null default now()
);

alter table public.lead_photos enable row level security;

drop policy if exists "Authenticated users read lead photos" on public.lead_photos;
create policy "Authenticated users read lead photos"
  on public.lead_photos for select to authenticated
  using (true);
