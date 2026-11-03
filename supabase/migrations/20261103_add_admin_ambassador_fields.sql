-- Admin-managed Ambassador records keep their commercial agreement data on
-- the Ambassador product assignment. Contact identity remains in public.leads
-- so First/Last Name can be stored separately and rendered as Full Name.
alter table public.lead_product_assignments
  add column if not exists ambassador_commission numeric(14, 2),
  add column if not exists ambassador_commission_notes text,
  add column if not exists ambassador_priority smallint,
  add column if not exists ambassador_agreement_status text,
  add column if not exists ambassador_signed_agreement_link text,
  add column if not exists ambassador_last_called_on timestamptz,
  add column if not exists ambassador_last_call_notes text,
  add column if not exists ambassador_remark text,
  add column if not exists ambassador_manan_sir_notes text,
  add column if not exists ambassador_target_leads integer,
  add column if not exists ambassador_target_demo integer,
  add column if not exists ambassador_target_proposals integer,
  add column if not exists ambassador_target_sales integer;

alter table public.lead_product_assignments
  drop constraint if exists lead_product_assignments_ambassador_priority_check,
  add constraint lead_product_assignments_ambassador_priority_check
    check (ambassador_priority is null or ambassador_priority between 1 and 3),
  drop constraint if exists lead_product_assignments_ambassador_agreement_status_check,
  add constraint lead_product_assignments_ambassador_agreement_status_check
    check (ambassador_agreement_status is null or ambassador_agreement_status in (
      'Abandoned', 'Agreement Sent', 'Agreement Signed', 'Not Pitched',
      'Pitched', 'Query', 'Said No', 'Verbal Yes'
    )),
  drop constraint if exists lead_product_assignments_ambassador_targets_check,
  add constraint lead_product_assignments_ambassador_targets_check
    check (
      (ambassador_target_leads is null or ambassador_target_leads >= 0)
      and (ambassador_target_demo is null or ambassador_target_demo >= 0)
      and (ambassador_target_proposals is null or ambassador_target_proposals >= 0)
      and (ambassador_target_sales is null or ambassador_target_sales >= 0)
    );

create index if not exists lead_product_assignments_ambassador_status_idx
  on public.lead_product_assignments (ambassador_agreement_status, ambassador_priority, assigned_to)
  where is_ambassador and is_active;

-- Preserve the resolution-based Ambassador flow and also allow an admin to
-- create/import an Ambassador record directly from the Admin Ambassador page.
create or replace function public.retain_ambassador_assignment()
returns trigger language plpgsql set search_path = public as $$
declare
  qualifies boolean;
  direct_admin_ambassador boolean;
begin
  if tg_op = 'UPDATE' and old.is_ambassador then
    if new.assigned_to is distinct from old.assigned_to
      and coalesce(auth.role(), '') <> 'service_role'
      and not public.has_role('admin') then
      raise exception 'Only an admin can reassign an Ambassador.';
    end if;
    if new.product_id is distinct from old.product_id then
      raise exception 'An established Ambassador cannot be changed to another product.';
    end if;
    new.is_ambassador := true;
  else
    select exists (
      select 1 from public.lead_products p, public.lead_resolutions r
      where p.id = new.product_id and r.id = new.latest_resolution_id
        and upper(btrim(p.code)) = 'AMBASSADOR'
        and regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') in (
          'agreementsignedwaived', 'agreementsignedorwaived',
          'agreementsignedwaivedoff', 'agreementsignedorwaivedoff'
        )
    ) into qualifies;
    direct_admin_ambassador := new.is_ambassador and (
      coalesce(auth.role(), '') = 'service_role' or public.has_role('admin')
    );
    new.is_ambassador := direct_admin_ambassador or (qualifies and new.assigned_to is not null);
  end if;

  if new.is_ambassador then
    new.is_closed := true;
    new.is_active := true;
    new.focused_on := null;
  end if;
  return new;
end;
$$;
