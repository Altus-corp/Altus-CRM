-- Additional people who belong to a lead. The original leads row remains
-- untouched so changing a contact's priority never destroys lead history.
create table if not exists public.lead_contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  first_name text not null,
  last_name text,
  email text,
  designation text,
  department_function text,
  contact_type text not null default 'secondary'
    check (contact_type in ('primary', 'secondary')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_contacts_lead_idx
  on public.lead_contacts (lead_id, contact_type, created_at);

-- There can be only one added Primary contact per lead. The original contact
-- on public.leads is preserved independently.
create unique index if not exists lead_contacts_one_primary_per_lead_idx
  on public.lead_contacts (lead_id)
  where contact_type = 'primary';

alter table public.lead_contacts enable row level security;

drop policy if exists "Admins manage lead contacts" on public.lead_contacts;
create policy "Admins manage lead contacts"
  on public.lead_contacts
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
