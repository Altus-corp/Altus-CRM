create type public.lead_field_type as enum (
  'text',
  'number',
  'date',
  'dropdown',
  'checkbox',
  'textarea'
);

create table public.lead_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lead_stages (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lead_products(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_active boolean not null default true,
  unique (product_id, name)
);

create table public.lead_resolutions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.lead_product_resolutions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lead_products(id) on delete cascade,
  resolution_id uuid not null references public.lead_resolutions(id) on delete cascade,
  next_stage_id uuid references public.lead_stages(id) on delete set null,
  requires_follow_up boolean not null default false,
  follow_up_after_hours integer,
  closes_lead boolean not null default false,
  is_active boolean not null default true,
  unique (product_id, resolution_id),
  check (follow_up_after_hours is null or follow_up_after_hours >= 0)
);

create table public.lead_custom_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.lead_products(id) on delete cascade,
  field_key text not null unique,
  label text not null,
  field_type public.lead_field_type not null,
  options jsonb not null default '[]'::jsonb,
  is_required boolean not null default false,
  show_when_field_id uuid references public.lead_custom_fields(id) on delete set null,
  show_when_value text,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (
    (show_when_field_id is null and show_when_value is null)
    or (show_when_field_id is not null and show_when_value is not null)
  )
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lead_products(id),
  stage_id uuid references public.lead_stages(id),
  latest_resolution_id uuid references public.lead_resolutions(id),
  assigned_to uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text,
  email text,
  phone text,
  custom_data jsonb not null default '{}'::jsonb,
  next_follow_up_at timestamptz,
  is_closed boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  resolution_id uuid references public.lead_resolutions(id),
  note text,
  follow_up_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index lead_stages_product_position_idx on public.lead_stages(product_id, position);
create index lead_product_resolutions_product_idx on public.lead_product_resolutions(product_id);
create index lead_custom_fields_product_position_idx on public.lead_custom_fields(product_id, position);
create index leads_assigned_created_idx on public.leads(assigned_to, created_at desc, id desc);
create index leads_product_stage_created_idx on public.leads(product_id, stage_id, created_at desc, id desc);
create index lead_activities_lead_created_idx on public.lead_activities(lead_id, created_at desc, id desc);

alter table public.lead_products enable row level security;
alter table public.lead_stages enable row level security;
alter table public.lead_resolutions enable row level security;
alter table public.lead_product_resolutions enable row level security;
alter table public.lead_custom_fields enable row level security;
alter table public.leads enable row level security;
alter table public.lead_activities enable row level security;

create policy "Authenticated users read lead configuration" on public.lead_products for select to authenticated using (true);
create policy "Authenticated users read lead stages" on public.lead_stages for select to authenticated using (true);
create policy "Authenticated users read lead resolutions" on public.lead_resolutions for select to authenticated using (true);
create policy "Authenticated users read product resolutions" on public.lead_product_resolutions for select to authenticated using (true);
create policy "Authenticated users read custom fields" on public.lead_custom_fields for select to authenticated using (true);

create policy "Admins manage lead products" on public.lead_products for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Admins manage lead stages" on public.lead_stages for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Admins manage lead resolutions" on public.lead_resolutions for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Admins manage product resolutions" on public.lead_product_resolutions for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy "Admins manage custom fields" on public.lead_custom_fields for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "Users read assigned leads or admins read all" on public.leads for select to authenticated using (assigned_to = (select auth.uid()) or public.has_role('admin'));
create policy "Users create leads" on public.leads for insert to authenticated with check (created_by = (select auth.uid()));
create policy "Users update assigned leads or admins update all" on public.leads for update to authenticated using (assigned_to = (select auth.uid()) or public.has_role('admin')) with check (assigned_to = (select auth.uid()) or public.has_role('admin'));
create policy "Users read activities for accessible leads" on public.lead_activities for select to authenticated using (exists (select 1 from public.leads where leads.id = lead_id and (leads.assigned_to = (select auth.uid()) or public.has_role('admin'))));
create policy "Users create activities for accessible leads" on public.lead_activities for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.leads where leads.id = lead_id and (leads.assigned_to = (select auth.uid()) or public.has_role('admin'))));

insert into public.lead_products (code, name) values
  ('PSO', 'Productivity Shashtra Orientation'),
  ('BSSO', 'Business Scaleup Shashtra Orientation'),
  ('PS', 'Productivity Shashtra')
on conflict (code) do update set name = excluded.name;

insert into public.lead_stages (product_id, name, position)
select p.id, s.name, s.position
from public.lead_products p
join (values
  ('PSO', 'Pre PSO', 1), ('PSO', 'During PSO', 2), ('PSO', 'Post PSO', 3), ('PSO', 'PSO Attendant', 4), ('PSO', 'PSO Not Attendant', 5),
  ('BSSO', 'Pre BSSO', 1), ('BSSO', 'During BSSO', 2), ('BSSO', 'Post BSSO', 3),
  ('PS', 'Pre PS', 1)
) as s(product_code, name, position) on p.code = s.product_code
on conflict (product_id, name) do update set position = excluded.position;

insert into public.lead_resolutions (name) values
  ('Call for next'), ('Follow up'), ('DND'), ('I will get Back'), ('Not Interested'), ('old, graduate'), ('registered'), ('Tentative'), ('Wrong Number'), ('Call Back'), ('Ringing'), ('No Busy'), ('Verbal Yes'), ('Abandoned'), ('Did not Attend')
on conflict (name) do nothing;

insert into public.lead_product_resolutions (product_id, resolution_id)
select p.id, r.id
from public.lead_products p
cross join public.lead_resolutions r
where p.code in ('PSO', 'BSSO')
on conflict (product_id, resolution_id) do nothing;
