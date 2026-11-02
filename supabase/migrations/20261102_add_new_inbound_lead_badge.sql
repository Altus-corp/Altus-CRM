-- Website/API leads assigned by the qualified-lead ratio are visually marked
-- as New until the assigned CRM user records their first real action.

alter table public.lead_product_assignments
  add column if not exists is_new_inbound boolean not null default false;

create index if not exists lead_product_assignments_new_inbound_idx
  on public.lead_product_assignments (assigned_to, focused_on, assigned_at desc)
  where is_new_inbound = true and is_active and not is_closed;

create or replace function public.mark_new_inbound_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The qualified ratio is reserved for inbound qualified leads.  Require an
  -- external source too, so imported/manual qualified records are not labelled
  -- as a fresh website lead.
  if new.assignment_origin = 'qualified_ratio'
    and new.assigned_to is not null
    and exists (
      select 1
      from public.leads lead
      where lead.id = new.lead_id
        and lead.external_source is not null
    )
    and (
      tg_op = 'INSERT'
      or old.assigned_to is distinct from new.assigned_to
      or old.assignment_origin is distinct from new.assignment_origin
    ) then
    new.is_new_inbound := true;
  end if;
  return new;
end;
$$;

drop trigger if exists mark_new_inbound_assignment on public.lead_product_assignments;
create trigger mark_new_inbound_assignment
before insert or update of assigned_to, assignment_origin
on public.lead_product_assignments
for each row execute function public.mark_new_inbound_assignment();

create or replace function public.clear_new_inbound_after_lead_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Assignment bookkeeping is not work performed by the CRM user. Every other
  -- activity (call, message, meeting, note, resolution, etc.) acknowledges it.
  if new.lead_product_assignment_id is not null
    and new.activity_type not in ('qualified_ratio_assigned') then
    update public.lead_product_assignments
    set is_new_inbound = false,
        updated_at = now()
    where id = new.lead_product_assignment_id
      and is_new_inbound = true;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_new_inbound_after_lead_activity on public.lead_activities;
create trigger clear_new_inbound_after_lead_activity
after insert on public.lead_activities
for each row execute function public.clear_new_inbound_after_lead_activity();
