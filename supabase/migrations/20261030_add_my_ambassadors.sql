alter table public.lead_product_assignments
  add column if not exists is_ambassador boolean not null default false;

create index if not exists lead_product_assignments_ambassador_owner_idx
  on public.lead_product_assignments(assigned_to, id) where is_ambassador;

update public.lead_product_assignments a
set is_ambassador = true, is_closed = true, focused_on = null
from public.lead_products p, public.lead_resolutions r
where a.product_id = p.id and a.latest_resolution_id = r.id
  and upper(btrim(p.code)) = 'AMBASSADOR'
  and regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') in
    ('agreementsignedwaived', 'agreementsignedorwaived')
  and a.assigned_to is not null;

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
        and regexp_replace(lower(r.name), '[^a-z0-9]+', '', 'g') in
          ('agreementsignedwaived', 'agreementsignedorwaived')
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

drop trigger if exists retain_ambassador_assignment on public.lead_product_assignments;
create trigger retain_ambassador_assignment before insert or update
on public.lead_product_assignments for each row
execute function public.retain_ambassador_assignment();
