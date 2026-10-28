-- CRM intake metadata. created_at is the Lead Acquisition Date: the time the
-- record first enters this CRM via an import, sync, or manual creation.
create sequence if not exists public.lead_number_sequence start with 10001;

alter table public.leads
  add column if not exists lead_number bigint;

with numbered_leads as (
  select id, 10000 + row_number() over (order by created_at, id) as number
  from public.leads
  where lead_number is null
)
update public.leads lead
set lead_number = numbered_leads.number
from numbered_leads
where lead.id = numbered_leads.id;

select setval(
  'public.lead_number_sequence',
  greatest(coalesce((select max(lead_number) from public.leads), 10000), 10000),
  true
);

alter table public.leads
  alter column lead_number set default nextval('public.lead_number_sequence'),
  alter column lead_number set not null;

create unique index if not exists leads_lead_number_key on public.leads (lead_number);

do $$
begin
  if not exists (select 1 from public.lead_table_columns where field_key = 'lead_number') then
    update public.lead_table_columns set position = position + 2;
    insert into public.lead_table_columns (field_key, label, source, field_type, is_required, is_visible, position) values
      ('lead_number', 'Lead No', 'standard', 'text', false, true, 1),
      ('lead_acquisition_date', 'Lead Acquisition Date', 'standard', 'date', false, true, 2);
  elsif not exists (select 1 from public.lead_table_columns where field_key = 'lead_acquisition_date') then
    insert into public.lead_table_columns (field_key, label, source, field_type, is_required, is_visible, position) values
      ('lead_acquisition_date', 'Lead Acquisition Date', 'standard', 'date', false, true, 2);
  end if;
end $$;
