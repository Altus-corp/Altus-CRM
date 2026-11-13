-- Junk Lead is a permanent intake suppression: when a CRM user marks a lead
-- as Junk Lead, future website forms with the same normalized phone or email
-- are rejected before they can create or update a CRM lead.

insert into public.lead_resolutions (name)
select 'Junk Lead'
where not exists (
  select 1
  from public.lead_resolutions
  where regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '', 'g') = 'junglead'
);

update public.lead_resolutions
set name = 'Junk Lead'
where regexp_replace(lower(btrim(name)), '[^a-z0-9]+', '', 'g') = 'junglead'
  and name <> 'Junk Lead';

insert into public.lead_product_resolutions (product_id, resolution_id)
select product.id, resolution.id
from public.lead_products product
join public.lead_resolutions resolution
  on regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'junglead'
where product.is_active
on conflict (product_id, resolution_id) do nothing;

create table if not exists public.lead_junk_suppressions (
  id uuid primary key default gen_random_uuid(),
  identifier_type text not null check (identifier_type in ('phone', 'email')),
  identifier_value text not null,
  source_lead_id uuid references public.leads(id) on delete set null,
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_junk_suppressions_identifier_unique unique (identifier_type, identifier_value),
  constraint lead_junk_suppressions_identifier_not_blank check (length(btrim(identifier_value)) > 0)
);

create index if not exists lead_junk_suppressions_lookup_idx
  on public.lead_junk_suppressions (identifier_type, identifier_value);

alter table public.lead_junk_suppressions enable row level security;

drop policy if exists "Admins manage Junk Lead suppressions" on public.lead_junk_suppressions;
create policy "Admins manage Junk Lead suppressions"
  on public.lead_junk_suppressions
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- Preserve Junk Lead decisions that were made before the permanent
-- suppression table existed.
insert into public.lead_junk_suppressions (
  identifier_type,
  identifier_value,
  source_lead_id,
  marked_by,
  marked_at,
  updated_at
)
select distinct on (public.normalize_lead_phone(lead.phone))
  'phone',
  public.normalize_lead_phone(lead.phone),
  lead.id,
  activity.created_by,
  activity.created_at,
  now()
from public.lead_activities activity
join public.lead_product_assignments assignment
  on assignment.id = activity.lead_product_assignment_id
join public.leads lead on lead.id = assignment.lead_id
join public.lead_resolutions resolution
  on resolution.id = (activity.metadata ->> 'resolution_id')::uuid
where activity.activity_type = 'resolution_updated'
  and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'junglead'
  and public.normalize_lead_phone(lead.phone) is not null
order by public.normalize_lead_phone(lead.phone), activity.created_at desc
on conflict (identifier_type, identifier_value) do nothing;

insert into public.lead_junk_suppressions (
  identifier_type,
  identifier_value,
  source_lead_id,
  marked_by,
  marked_at,
  updated_at
)
select distinct on (lower(btrim(lead.email)))
  'email',
  lower(btrim(lead.email)),
  lead.id,
  activity.created_by,
  activity.created_at,
  now()
from public.lead_activities activity
join public.lead_product_assignments assignment
  on assignment.id = activity.lead_product_assignment_id
join public.leads lead on lead.id = assignment.lead_id
join public.lead_resolutions resolution
  on resolution.id = (activity.metadata ->> 'resolution_id')::uuid
where activity.activity_type = 'resolution_updated'
  and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'junglead'
  and nullif(btrim(lead.email), '') is not null
order by lower(btrim(lead.email)), activity.created_at desc
on conflict (identifier_type, identifier_value) do nothing;
