-- Agreement Sent starts Pre Sales. Agreement Signed / Waived completes Pre
-- Sales and starts Ambassador onboarding. Existing records are repaired as
-- part of this migration so the dashboard agrees with the workflow immediately.
do $$
declare
  ambassador_product_id uuid;
  pre_sales_stage_id uuid;
  legacy_pre_ambassador_stage_id uuid;
  onboarding_stage_id uuid;
begin
  select id into ambassador_product_id
  from public.lead_products
  where upper(btrim(code)) = 'AMBASSADOR'
  limit 1;

  if ambassador_product_id is null then
    raise exception 'The AMBASSADOR product must exist before configuring its workflow stages.';
  end if;

  select id into pre_sales_stage_id
  from public.lead_stages
  where product_id = ambassador_product_id and name = 'Pre Sales'
  limit 1;

  select id into legacy_pre_ambassador_stage_id
  from public.lead_stages
  where product_id = ambassador_product_id and name = 'Pre Ambassador'
  limit 1;

  if pre_sales_stage_id is null and legacy_pre_ambassador_stage_id is not null then
    update public.lead_stages
    set name = 'Pre Sales'
    where id = legacy_pre_ambassador_stage_id;
    pre_sales_stage_id := legacy_pre_ambassador_stage_id;
  elsif pre_sales_stage_id is not null and legacy_pre_ambassador_stage_id is not null then
    update public.lead_product_assignments
    set stage_id = pre_sales_stage_id, updated_at = now()
    where stage_id = legacy_pre_ambassador_stage_id;

    update public.lead_stages
    set is_active = false
    where id = legacy_pre_ambassador_stage_id;
  end if;

  select id into onboarding_stage_id
  from public.lead_stages
  where product_id = ambassador_product_id
    and name = 'Onboarding Ambassador'
    and is_active
  limit 1;

  if onboarding_stage_id is null then
    raise exception 'Onboarding Ambassador stage must exist before routing signed Ambassadors.';
  end if;

  update public.lead_product_assignments assignment
  set stage_id = pre_sales_stage_id,
      updated_at = now()
  from public.lead_resolutions resolution
  where assignment.product_id = ambassador_product_id
    and assignment.latest_resolution_id = resolution.id
    and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'agreementsent';

  update public.lead_product_assignments assignment
  set stage_id = onboarding_stage_id,
      updated_at = now()
  from public.lead_resolutions resolution
  where assignment.product_id = ambassador_product_id
    and assignment.latest_resolution_id = resolution.id
    and assignment.assigned_to is not null
    and assignment.is_ambassador
    and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') in (
      'agreementsignedwaived', 'agreementsignedorwaived',
      'agreementsignedwaivedoff', 'agreementsignedorwaivedoff'
    );
end;
$$;

create or replace function public.retain_ambassador_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  qualifies boolean;
  is_pre_sales boolean;
  is_ambassador_product boolean;
  direct_admin_ambassador boolean;
  pre_sales_stage_id uuid;
  onboarding_stage_id uuid;
begin
  select upper(btrim(product.code)) = 'AMBASSADOR',
         regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') in (
           'agreementsignedwaived', 'agreementsignedorwaived',
           'agreementsignedwaivedoff', 'agreementsignedorwaivedoff'
         ),
         regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'agreementsent'
    into is_ambassador_product, qualifies, is_pre_sales
  from public.lead_products product
  left join public.lead_resolutions resolution on resolution.id = new.latest_resolution_id
  where product.id = new.product_id;

  qualifies := coalesce(is_ambassador_product, false) and coalesce(qualifies, false);
  is_pre_sales := coalesce(is_ambassador_product, false) and coalesce(is_pre_sales, false);

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
    direct_admin_ambassador := new.is_ambassador and (
      coalesce(auth.role(), '') = 'service_role' or public.has_role('admin')
    );
    new.is_ambassador := direct_admin_ambassador or (qualifies and new.assigned_to is not null);
  end if;

  if is_pre_sales then
    select stage.id into pre_sales_stage_id
    from public.lead_stages stage
    where stage.product_id = new.product_id
      and stage.name = 'Pre Sales'
      and stage.is_active
    order by stage.position
    limit 1;

    if pre_sales_stage_id is null then
      raise exception 'Pre Sales stage must be configured before marking Agreement Sent.';
    end if;
    new.stage_id := pre_sales_stage_id;
  elsif qualifies and new.assigned_to is not null then
    select stage.id into onboarding_stage_id
    from public.lead_stages stage
    where stage.product_id = new.product_id
      and stage.name = 'Onboarding Ambassador'
      and stage.is_active
    order by stage.position
    limit 1;

    if onboarding_stage_id is null then
      raise exception 'Onboarding Ambassador stage must be configured before marking Agreement Signed / Waived.';
    end if;
    new.stage_id := onboarding_stage_id;
  end if;

  if new.is_ambassador then
    new.is_closed := true;
    new.is_active := true;
    new.focused_on := null;
  end if;
  return new;
end;
$$;
