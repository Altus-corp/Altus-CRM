-- Actual Leads belongs to an Ambassador account, not to a manually entered
-- number. Link an Ambassador product record to its Ambassador login by the
-- shared 10-digit Cell Number, then calculate its lead total from Channel
-- Partner shares.
alter table public.lead_product_assignments
  add column if not exists ambassador_user_id uuid references auth.users(id) on delete set null;

create index if not exists lead_product_assignments_ambassador_user_idx
  on public.lead_product_assignments (ambassador_user_id)
  where is_ambassador and is_active;

create or replace function public.match_ambassador_user_by_cell_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_ambassador and new.ambassador_user_id is null then
    select profile.id
      into new.ambassador_user_id
    from public.leads lead
    join public.profiles profile
      on right(regexp_replace(coalesce(profile.phone, ''), '\\D', '', 'g'), 10) =
         right(regexp_replace(coalesce(lead.phone, ''), '\\D', '', 'g'), 10)
    join public.user_roles role
      on role.user_id = profile.id
     and role.role::text = 'ambassador'
    where lead.id = new.lead_id
      and length(regexp_replace(coalesce(lead.phone, ''), '\\D', '', 'g')) >= 10
      and length(regexp_replace(coalesce(profile.phone, ''), '\\D', '', 'g')) >= 10
    order by profile.id
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists match_ambassador_user_by_cell_number on public.lead_product_assignments;
create trigger match_ambassador_user_by_cell_number
before insert or update of is_ambassador, lead_id, ambassador_user_id
on public.lead_product_assignments
for each row execute function public.match_ambassador_user_by_cell_number();

-- Backfill existing Ambassador records whose Cell Number already matches an
-- active Ambassador account profile.
update public.lead_product_assignments assignment
set ambassador_user_id = matched.id
from public.leads lead
cross join lateral (
  select profile.id
  from public.profiles profile
  join public.user_roles role
    on role.user_id = profile.id
   and role.role::text = 'ambassador'
  where right(regexp_replace(coalesce(profile.phone, ''), '\\D', '', 'g'), 10) =
        right(regexp_replace(coalesce(lead.phone, ''), '\\D', '', 'g'), 10)
    and length(regexp_replace(coalesce(profile.phone, ''), '\\D', '', 'g')) >= 10
  order by profile.id
  limit 1
) matched
where assignment.lead_id = lead.id
  and assignment.is_ambassador
  and assignment.ambassador_user_id is null
  and length(regexp_replace(coalesce(lead.phone, ''), '\\D', '', 'g')) >= 10;

create or replace function public.recalculate_ambassador_actual_leads(target_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_ambassador_id is null then
    return;
  end if;

  update public.lead_product_assignments assignment
  set ambassador_actual_leads = coalesce((
        select count(distinct partner.lead_id)
        from public.lead_channel_partners partner
        where partner.ambassador_id = target_ambassador_id
      ), 0),
      updated_at = now()
  where assignment.is_ambassador
    and assignment.is_active
    and assignment.ambassador_user_id = target_ambassador_id;
end;
$$;

create or replace function public.refresh_ambassador_actual_leads_from_channel_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_ambassador_actual_leads(coalesce(new.ambassador_id, old.ambassador_id));
  if tg_op = 'UPDATE' and new.ambassador_id is distinct from old.ambassador_id then
    perform public.recalculate_ambassador_actual_leads(old.ambassador_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_leads_from_channel_partner on public.lead_channel_partners;
create trigger refresh_ambassador_actual_leads_from_channel_partner
after insert or update of ambassador_id or delete
on public.lead_channel_partners
for each row execute function public.refresh_ambassador_actual_leads_from_channel_partner();

create or replace function public.refresh_ambassador_actual_leads_from_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_ambassador and new.ambassador_user_id is not null then
    perform public.recalculate_ambassador_actual_leads(new.ambassador_user_id);
  end if;
  if tg_op = 'UPDATE' and old.ambassador_user_id is distinct from new.ambassador_user_id then
    perform public.recalculate_ambassador_actual_leads(old.ambassador_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_leads_from_record on public.lead_product_assignments;
create trigger refresh_ambassador_actual_leads_from_record
after insert or update of is_ambassador, ambassador_user_id
on public.lead_product_assignments
for each row execute function public.refresh_ambassador_actual_leads_from_record();

-- Populate the stored display value for already linked Ambassador records.
update public.lead_product_assignments assignment
set ambassador_actual_leads = coalesce((
      select count(distinct partner.lead_id)
      from public.lead_channel_partners partner
      where partner.ambassador_id = assignment.ambassador_user_id
    ), 0),
    updated_at = now()
where assignment.is_ambassador
  and assignment.is_active
  and assignment.ambassador_user_id is not null;

-- An administrator may add or correct an Ambassador's Cell Number after the
-- record exists. Rebind it immediately instead of requiring a migration rerun.
create or replace function public.refresh_ambassador_user_after_cell_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.phone is not distinct from old.phone then
    return new;
  end if;

  update public.lead_product_assignments
  set ambassador_user_id = null
  where lead_id = new.id
    and is_ambassador;

  return new;
end;
$$;

drop trigger if exists refresh_ambassador_user_after_cell_change on public.leads;
create trigger refresh_ambassador_user_after_cell_change
after update of phone on public.leads
for each row execute function public.refresh_ambassador_user_after_cell_change();
