-- One CRM contact is identified by one normalized phone number.
-- India numbers are compared by their last ten digits, so +91 and plain forms match.
alter table public.leads
  add column if not exists phone_key text;

create or replace function public.normalize_lead_phone(value text)
returns text
language sql
immutable
as $$
  select nullif(
    case
      when length(regexp_replace(coalesce(value, ''), '\\D', '', 'g')) >= 10
        then right(regexp_replace(coalesce(value, ''), '\\D', '', 'g'), 10)
      else regexp_replace(coalesce(value, ''), '\\D', '', 'g')
    end,
    ''
  );
$$;

update public.leads
set phone_key = public.normalize_lead_phone(phone)
where phone_key is distinct from public.normalize_lead_phone(phone);

create index if not exists leads_phone_key_idx on public.leads (phone_key);

create or replace function public.enforce_unique_lead_phone()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.phone_key := public.normalize_lead_phone(new.phone);

  if new.phone_key is null then
    return new;
  end if;

  -- Serializes concurrent inserts for the same phone key before checking it.
  perform pg_advisory_xact_lock(hashtext(new.phone_key));

  if exists (
    select 1
    from public.leads lead
    where lead.phone_key = new.phone_key
      and lead.id is distinct from new.id
  ) then
    raise exception 'A lead already exists with this phone number.' using errcode = 'unique_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_unique_lead_phone_on_write on public.leads;
create trigger enforce_unique_lead_phone_on_write
before insert or update of phone on public.leads
for each row execute function public.enforce_unique_lead_phone();

-- Existing duplicate values are intentionally preserved for review; this rule
-- prevents any further duplicate phone numbers without deleting lead history.
-- To review existing duplicates:
-- select phone_key, count(*) from public.leads where phone_key is not null group by phone_key having count(*) > 1;
