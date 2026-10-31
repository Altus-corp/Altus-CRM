-- "Agreement Signed / Waived Off" is the resolution used in the CRM. The
-- original Ambassador trigger did not recognize the trailing "Off", so the
-- Sales Person relationship could remain unmarked even after completion.
create or replace function public.retain_ambassador_assignment()
returns trigger language plpgsql set search_path = public as $$
declare qualifies boolean;
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
          'agreementsignedwaived',
          'agreementsignedorwaived',
          'agreementsignedwaivedoff',
          'agreementsignedorwaivedoff'
        )
    ) into qualifies;
    new.is_ambassador := qualifies and new.assigned_to is not null;
  end if;
  if new.is_ambassador then
    new.is_closed := true;
    new.is_active := true;
    new.focused_on := null;
  end if;
  return new;
end;
$$;

-- Repair Ambassador product work that was already completed before this fix.
update public.lead_product_assignments assignment
set is_ambassador = true,
    is_closed = true,
    is_active = true,
    focused_on = null
from public.lead_products product, public.lead_resolutions resolution
where assignment.product_id = product.id
  and assignment.latest_resolution_id = resolution.id
  and assignment.assigned_to is not null
  and upper(btrim(product.code)) = 'AMBASSADOR'
  and regexp_replace(lower(resolution.name), '[^a-z0-9]+', '', 'g') in (
    'agreementsignedwaived',
    'agreementsignedorwaived',
    'agreementsignedwaivedoff',
    'agreementsignedorwaivedoff'
  );
