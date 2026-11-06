-- A lead can be explicitly attributed to one Senior Ambassador before that
-- lead becomes an Ambassador. When the lead is converted, that attribution is
-- promoted into the permanent Senior -> Junior Ambassador hierarchy.
create table if not exists public.lead_senior_ambassadors (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  senior_ambassador_id uuid not null references auth.users(id) on delete restrict,
  selected_by uuid references auth.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_senior_ambassadors_senior_idx
  on public.lead_senior_ambassadors (senior_ambassador_id);

alter table public.lead_senior_ambassadors enable row level security;

drop policy if exists "Admins manage lead Senior Ambassador selections" on public.lead_senior_ambassadors;
create policy "Admins manage lead Senior Ambassador selections"
  on public.lead_senior_ambassadors for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

create table if not exists public.ambassador_hierarchy (
  junior_ambassador_id uuid primary key references auth.users(id) on delete cascade,
  senior_ambassador_id uuid not null references auth.users(id) on delete restrict,
  source_lead_id uuid references public.leads(id) on delete set null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ambassador_hierarchy_not_self check (junior_ambassador_id <> senior_ambassador_id)
);

create index if not exists ambassador_hierarchy_senior_idx
  on public.ambassador_hierarchy (senior_ambassador_id);

alter table public.ambassador_hierarchy enable row level security;

drop policy if exists "Admins manage Ambassador hierarchy" on public.ambassador_hierarchy;
create policy "Admins manage Ambassador hierarchy"
  on public.ambassador_hierarchy for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));

-- Display this in every lead table. It is a standard relationship column,
-- rather than a product/stage field, so it works for all products.
insert into public.lead_table_columns (field_key, label, source, position, is_visible)
select 'senior_ambassador', 'Senior Ambassador', 'standard', positions.next_position, true
from (
  select coalesce(max(position), 0) + 1 as next_position
  from public.lead_table_columns
) positions
where not exists (
  select 1 from public.lead_table_columns where field_key = 'senior_ambassador'
)
on conflict (field_key) do nothing;

-- Convert a selected Senior Ambassador to a permanent hierarchy row when a
-- lead becomes an Ambassador. If no explicit dropdown value was selected, the
-- newest Channel Partner on that lead is the natural senior referral source.
create or replace function public.sync_ambassador_hierarchy_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  junior_id uuid;
  senior_id uuid;
  selected_by_id uuid;
begin
  if not new.is_ambassador then
    return new;
  end if;

  junior_id := new.ambassador_user_id;
  -- Retain a safe fallback here because the existing "is Ambassador" and
  -- phone-match triggers may run in either order on an update.
  if junior_id is null then
    select profile.id into junior_id
    from public.leads lead
    join public.profiles profile
      on right(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g'), 10) =
         right(regexp_replace(coalesce(lead.phone, ''), '[^0-9]', '', 'g'), 10)
    join public.user_roles role
      on role.user_id = profile.id and role.role::text = 'ambassador'
    where lead.id = new.lead_id
      and length(regexp_replace(coalesce(lead.phone, ''), '[^0-9]', '', 'g')) >= 10
      and length(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')) >= 10
    order by profile.id
    limit 1;

    if junior_id is not null then
      update public.lead_product_assignments
      set ambassador_user_id = junior_id,
          updated_at = now()
      where id = new.id
        and ambassador_user_id is null;
    end if;
  end if;

  if junior_id is null then
    return new;
  end if;

  select senior_ambassador_id, selected_by
    into senior_id, selected_by_id
  from public.lead_senior_ambassadors
  where lead_id = new.lead_id;

  if senior_id is null then
    select partner.ambassador_id, partner.assigned_by
      into senior_id, selected_by_id
    from public.lead_channel_partners partner
    join public.user_roles role
      on role.user_id = partner.ambassador_id
     and role.role::text = 'ambassador'
    where partner.lead_id = new.lead_id
      and partner.ambassador_id <> junior_id
    order by partner.assigned_at desc nulls last, partner.ambassador_id
    limit 1;
  end if;

  if senior_id is not null and senior_id <> junior_id then
    insert into public.ambassador_hierarchy (
      junior_ambassador_id, senior_ambassador_id, source_lead_id, assigned_by, updated_at
    ) values (
      junior_id, senior_id, new.lead_id, selected_by_id, now()
    )
    on conflict (junior_ambassador_id) do update
    set senior_ambassador_id = excluded.senior_ambassador_id,
        source_lead_id = excluded.source_lead_id,
        assigned_by = excluded.assigned_by,
        updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists sync_ambassador_hierarchy_from_lead on public.lead_product_assignments;
create trigger sync_ambassador_hierarchy_from_lead
after insert or update of is_ambassador, ambassador_user_id, lead_id
on public.lead_product_assignments
for each row execute function public.sync_ambassador_hierarchy_from_lead();

-- Changing the dropdown after conversion updates the hierarchy immediately.
create or replace function public.sync_ambassador_hierarchy_from_selection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  junior_id uuid;
begin
  select ambassador_user_id into junior_id
  from public.lead_product_assignments
  where lead_id = new.lead_id
    and is_ambassador
    and ambassador_user_id is not null
  order by updated_at desc nulls last, id desc
  limit 1;

  if junior_id is not null and junior_id <> new.senior_ambassador_id then
    insert into public.ambassador_hierarchy (
      junior_ambassador_id, senior_ambassador_id, source_lead_id, assigned_by, updated_at
    ) values (
      junior_id, new.senior_ambassador_id, new.lead_id, new.selected_by, now()
    )
    on conflict (junior_ambassador_id) do update
    set senior_ambassador_id = excluded.senior_ambassador_id,
        source_lead_id = excluded.source_lead_id,
        assigned_by = excluded.assigned_by,
        updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists sync_ambassador_hierarchy_from_selection on public.lead_senior_ambassadors;
create trigger sync_ambassador_hierarchy_from_selection
after insert or update of senior_ambassador_id
on public.lead_senior_ambassadors
for each row execute function public.sync_ambassador_hierarchy_from_selection();

-- Backfill existing Ambassador records from their Channel Partner selections.
update public.lead_product_assignments work
set ambassador_user_id = matched.user_id,
    updated_at = now()
from public.leads lead
cross join lateral (
  select profile.id as user_id
  from public.profiles profile
  join public.user_roles role
    on role.user_id = profile.id and role.role::text = 'ambassador'
  where right(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g'), 10) =
        right(regexp_replace(coalesce(lead.phone, ''), '[^0-9]', '', 'g'), 10)
    and length(regexp_replace(coalesce(profile.phone, ''), '[^0-9]', '', 'g')) >= 10
  order by profile.id
  limit 1
) matched
where work.lead_id = lead.id
  and work.is_ambassador
  and work.ambassador_user_id is null
  and length(regexp_replace(coalesce(lead.phone, ''), '[^0-9]', '', 'g')) >= 10;

insert into public.ambassador_hierarchy (
  junior_ambassador_id, senior_ambassador_id, source_lead_id, assigned_by, updated_at
)
select distinct on (work.ambassador_user_id)
  work.ambassador_user_id,
  partner.ambassador_id,
  work.lead_id,
  partner.assigned_by,
  now()
from public.lead_product_assignments work
join public.lead_channel_partners partner on partner.lead_id = work.lead_id
join public.user_roles role
  on role.user_id = partner.ambassador_id
 and role.role::text = 'ambassador'
where work.is_ambassador
  and work.ambassador_user_id is not null
  and partner.ambassador_id <> work.ambassador_user_id
order by work.ambassador_user_id, partner.assigned_at desc nulls last, work.updated_at desc nulls last
on conflict (junior_ambassador_id) do nothing;
