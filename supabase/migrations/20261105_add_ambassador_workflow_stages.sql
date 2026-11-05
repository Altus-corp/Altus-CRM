-- The Ambassador product starts with two workflow queues. Pre Sales is only
-- for leads marked Agreement Sent; signed/waived leads are routed to
-- Onboarding Ambassador by the follow-up workflow migration.
do $$
declare
  ambassador_product_id uuid;
  pre_sales_stage_id uuid;
begin
  select id
    into ambassador_product_id
  from public.lead_products
  where upper(btrim(code)) = 'AMBASSADOR'
  limit 1;

  if ambassador_product_id is null then
    raise exception 'The AMBASSADOR product must exist before adding Ambassador stages.';
  end if;

  insert into public.lead_stages (product_id, name, position, is_active)
  values
    (ambassador_product_id, 'Pre Sales', 1, true),
    (ambassador_product_id, 'Onboarding Ambassador', 2, true)
  on conflict (product_id, name) do update
  set position = excluded.position,
      is_active = true;

  select id
    into pre_sales_stage_id
  from public.lead_stages
  where product_id = ambassador_product_id
    and name = 'Pre Sales'
  limit 1;

  update public.lead_product_assignments assignment
  set stage_id = pre_sales_stage_id,
      updated_at = now()
  from public.lead_resolutions resolution
  where assignment.product_id = ambassador_product_id
    and assignment.stage_id is null
    and assignment.latest_resolution_id = resolution.id
    and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'agreementsent';
end;
$$;

create index if not exists lead_product_assignments_ambassador_stage_idx
  on public.lead_product_assignments (stage_id, assigned_at desc, id desc)
  where is_ambassador and is_active;
