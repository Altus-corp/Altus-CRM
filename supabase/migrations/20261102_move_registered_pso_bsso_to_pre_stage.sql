-- A Registered activity resolution starts the appropriate orientation flow.
-- Keep this in the database so every write path follows the same rule.

create or replace function public.apply_resolution_workspace_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution_key text;
  product_code text;
  registration_stage_name text;
  registration_stage_id uuid;
begin
  if new.latest_resolution_id is null then
    return new;
  end if;

  select lower(regexp_replace(trim(name), '[,_[:space:]-]+', ' ', 'g'))
    into resolution_key
  from public.lead_resolutions
  where id = new.latest_resolution_id;

  if resolution_key = 'registered' then
    select upper(code) into product_code
    from public.lead_products
    where id = new.product_id;

    registration_stage_name := case product_code
      when 'PSO' then 'Pre PSO'
      when 'BSSO' then 'Pre BSSO'
      else null
    end;

    if registration_stage_name is not null then
      select id into registration_stage_id
      from public.lead_stages
      where product_id = new.product_id
        and name = registration_stage_name
        and is_active = true
      order by position
      limit 1;

      if registration_stage_id is not null then
        new.stage_id := registration_stage_id;
      end if;
    end if;
  end if;

  if resolution_key in (
    'no busy', 'ringing', 'did not pick', 'call back', 'callback',
    'did not answer', 'no answer', 'dnd', 'not interested', 'lost',
    'i will get back', 'wrong number', 'old graduate', 'abandoned'
  ) then
    new.focused_on := null;
  end if;

  if resolution_key = 'abandoned' then
    new.next_follow_up_at := null;
    new.assigned_to := null;
  end if;

  return new;
end;
$$;

-- Repair any existing PSO/BSSO work already marked Registered.
update public.lead_product_assignments as assignment
set stage_id = stage.id,
    updated_at = now()
from public.lead_resolutions as resolution,
     public.lead_products as product,
     public.lead_stages as stage
where resolution.id = assignment.latest_resolution_id
  and product.id = assignment.product_id
  and stage.product_id = assignment.product_id
  and stage.name = case upper(product.code)
    when 'PSO' then 'Pre PSO'
    when 'BSSO' then 'Pre BSSO'
    else null
  end
  and stage.is_active = true
  and lower(regexp_replace(trim(resolution.name), '[,_[:space:]-]+', ' ', 'g')) = 'registered'
  and upper(product.code) in ('PSO', 'BSSO')
  and assignment.stage_id is distinct from stage.id;
