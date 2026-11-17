-- A Secondary contact previously had no phone number of its own, so making
-- one Primary could not carry a phone number onto the lead record.
alter table public.lead_contacts
  add column if not exists phone text;
