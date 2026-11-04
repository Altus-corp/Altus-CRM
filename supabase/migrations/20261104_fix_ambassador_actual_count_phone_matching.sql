-- Repair Ambassador account matching used by automatic Actual Lead and Actual
-- Demo counts. Phone comparisons always use the last ten Indian mobile digits,
-- so +91, 91, spaces, and hyphens all match the same account.

create or replace function public.normalize_lead_phone(value text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when length(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g')) >= 10
        then right(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), 10)
      else regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g')
    end,
    ''
  );
$$;

-- Keep the existing leads phone key consistent with the corrected normalizer.
update public.leads
set phone_key = public.normalize_lead_phone(phone)
where phone_key is distinct from public.normalize_lead_phone(phone);

create or replace function public.match_ambassador_user_by_cell_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_ambassador then
    select profile.id
      into new.ambassador_user_id
    from public.leads lead
    join public.profiles profile
      on public.normalize_lead_phone(profile.phone) = public.normalize_lead_phone(lead.phone)
    join public.user_roles role
      on role.user_id = profile.id
     and role.role::text = 'ambassador'
    where lead.id = new.lead_id
      and length(public.normalize_lead_phone(lead.phone)) = 10
      and length(public.normalize_lead_phone(profile.phone)) = 10
    order by profile.id
    limit 1;
  end if;
  return new;
end;
$$;

-- Rebind every Ambassador record, including records created before the first
-- automatic-count migration. A record without a matching Ambassador login
-- remains unlinked and therefore cannot receive an automatic count.
with matched_records as (
  select distinct on (ambassador_record.id)
    ambassador_record.id,
    profile.id as user_id
  from public.lead_product_assignments ambassador_record
  join public.leads lead on lead.id = ambassador_record.lead_id
  join public.profiles profile
    on public.normalize_lead_phone(profile.phone) = public.normalize_lead_phone(lead.phone)
  join public.user_roles role
    on role.user_id = profile.id
   and role.role::text = 'ambassador'
  where ambassador_record.is_ambassador
    and length(public.normalize_lead_phone(lead.phone)) = 10
    and length(public.normalize_lead_phone(profile.phone)) = 10
  order by ambassador_record.id, profile.id
)
update public.lead_product_assignments ambassador_record
set ambassador_user_id = matched.user_id,
    updated_at = now()
from matched_records matched
where ambassador_record.id = matched.id
  and ambassador_record.ambassador_user_id is distinct from matched.user_id;

-- Recalculate both stored values now, rather than waiting for the next action.
do $$
declare
  ambassador record;
begin
  for ambassador in
    select distinct ambassador_user_id
    from public.lead_product_assignments
    where is_ambassador
      and is_active
      and ambassador_user_id is not null
  loop
    perform public.recalculate_ambassador_actual_leads(ambassador.ambassador_user_id);
    perform public.recalculate_ambassador_actual_demo(ambassador.ambassador_user_id);
  end loop;
end;
$$;
