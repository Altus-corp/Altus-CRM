-- Admin-defined dropdowns for a product stage (Dropdown management) and the choices users make in them.
create table if not exists public.lead_stage_dropdowns (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lead_products(id) on delete cascade,
  stage_id uuid not null references public.lead_stages(id) on delete cascade,
  label text not null,
  position integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (stage_id, label)
);

create table if not exists public.lead_stage_dropdown_options (
  id uuid primary key default gen_random_uuid(),
  dropdown_id uuid not null references public.lead_stage_dropdowns(id) on delete cascade,
  label text not null,
  position integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (dropdown_id, label)
);

-- One chosen option per dropdown per product assignment. Written server-side (service role)
-- after the action checks the caller owns the assignment, so only a read policy is needed.
create table if not exists public.lead_stage_dropdown_values (
  assignment_id uuid not null references public.lead_product_assignments(id) on delete cascade,
  dropdown_id uuid not null references public.lead_stage_dropdowns(id) on delete cascade,
  option_id uuid not null references public.lead_stage_dropdown_options(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (assignment_id, dropdown_id)
);

create index if not exists lead_stage_dropdowns_stage_idx on public.lead_stage_dropdowns (stage_id);
create index if not exists lead_stage_dropdown_options_dropdown_idx on public.lead_stage_dropdown_options (dropdown_id);

alter table public.lead_stage_dropdowns enable row level security;
alter table public.lead_stage_dropdown_options enable row level security;
alter table public.lead_stage_dropdown_values enable row level security;

create policy "Authenticated users read stage dropdowns" on public.lead_stage_dropdowns for select to authenticated using (true);
create policy "Admins manage stage dropdowns" on public.lead_stage_dropdowns for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "Authenticated users read stage dropdown options" on public.lead_stage_dropdown_options for select to authenticated using (true);
create policy "Admins manage stage dropdown options" on public.lead_stage_dropdown_options for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create policy "Users read dropdown values for their assignments or admins read all"
  on public.lead_stage_dropdown_values for select to authenticated
  using (
    public.has_role('admin') or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.id = lead_stage_dropdown_values.assignment_id
        and assignment.assigned_to = (select auth.uid()) and assignment.is_active
    )
  );

-- Seed the three dropdowns that used to be fixed on PSO > Pre PSO, and carry over what users already saved.
do $$
declare
  pso_id uuid;
  pre_stage_id uuid;
  done_by_id uuid;
  call_status_id uuid;
  meeting_id uuid;
begin
  select id into pso_id from public.lead_products where upper(code) = 'PSO' limit 1;
  if pso_id is null then return; end if;
  select id into pre_stage_id from public.lead_stages where product_id = pso_id and lower(name) = 'pre pso' limit 1;
  if pre_stage_id is null then return; end if;

  insert into public.lead_stage_dropdowns (product_id, stage_id, label, position) values
    (pso_id, pre_stage_id, 'Confirmation Done By', 1),
    (pso_id, pre_stage_id, 'Confirmation Call Status', 2),
    (pso_id, pre_stage_id, 'Meeting Link Send', 3)
  on conflict (stage_id, label) do nothing;

  select id into done_by_id from public.lead_stage_dropdowns where stage_id = pre_stage_id and label = 'Confirmation Done By';
  select id into call_status_id from public.lead_stage_dropdowns where stage_id = pre_stage_id and label = 'Confirmation Call Status';
  select id into meeting_id from public.lead_stage_dropdowns where stage_id = pre_stage_id and label = 'Meeting Link Send';

  insert into public.lead_stage_dropdown_options (dropdown_id, label, position)
    select call_status_id, resolution.name, row_number() over (order by resolution.name)
    from public.lead_product_resolutions mapping join public.lead_resolutions resolution on resolution.id = mapping.resolution_id
    where mapping.product_id = pso_id and mapping.is_active
  on conflict (dropdown_id, label) do nothing;

  insert into public.lead_stage_dropdown_options (dropdown_id, label, position) values (meeting_id, 'Yes', 1), (meeting_id, 'No', 2)
  on conflict (dropdown_id, label) do nothing;

  if to_regclass('public.lead_pre_pso_details') is not null then
    insert into public.lead_stage_dropdown_options (dropdown_id, label, position)
      select done_by_id, name, row_number() over (order by name)
      from (select distinct confirmation_done_by as name from public.lead_pre_pso_details where confirmation_done_by is not null) names
    on conflict (dropdown_id, label) do nothing;

    insert into public.lead_stage_dropdown_values (assignment_id, dropdown_id, option_id, lead_id)
      select details.assignment_id, done_by_id, option.id, details.lead_id
      from public.lead_pre_pso_details details
      join public.lead_stage_dropdown_options option on option.dropdown_id = done_by_id and option.label = details.confirmation_done_by
    on conflict do nothing;

    insert into public.lead_stage_dropdown_values (assignment_id, dropdown_id, option_id, lead_id)
      select details.assignment_id, call_status_id, option.id, details.lead_id
      from public.lead_pre_pso_details details
      join public.lead_resolutions resolution on resolution.id = details.confirmation_call_resolution_id
      join public.lead_stage_dropdown_options option on option.dropdown_id = call_status_id and option.label = resolution.name
    on conflict do nothing;

    insert into public.lead_stage_dropdown_values (assignment_id, dropdown_id, option_id, lead_id)
      select details.assignment_id, meeting_id, option.id, details.lead_id
      from public.lead_pre_pso_details details
      join public.lead_stage_dropdown_options option on option.dropdown_id = meeting_id
        and option.label = case when details.meeting_link_sent then 'Yes' else 'No' end
      where details.meeting_link_sent is not null
    on conflict do nothing;
  end if;
end $$;
