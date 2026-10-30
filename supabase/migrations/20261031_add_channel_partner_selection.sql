alter table public.leads add column if not exists channel_partner_ids uuid[] not null default '{}';

-- Existing Ambassador imports start with that Ambassador selected. This field
-- is separate from import provenance and never changes round-robin eligibility.
update public.leads set channel_partner_ids = array[ambassador_imported_by]
where ambassador_imported_by is not null and cardinality(channel_partner_ids) = 0;

create or replace function public.initialize_lead_channel_partners()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.ambassador_imported_by is not null then
    new.channel_partner_ids := array[new.ambassador_imported_by];
  end if;
  return new;
end;
$$;
-- Runs after mark_ambassador_import, which sets the importer before insertion.
drop trigger if exists zz_initialize_lead_channel_partners on public.leads;
create trigger zz_initialize_lead_channel_partners before insert on public.leads
for each row execute function public.initialize_lead_channel_partners();
