-- BSSO follows the same stage table structure as PSO. Copy the admin-managed
-- dropdown fields and their options stage-for-stage so users see the same
-- columns in Pre, During, and Post BSSO.
do $$
declare
  pso_id uuid;
  bsso_id uuid;
begin
  select id into pso_id from public.lead_products where upper(code) = 'PSO' limit 1;
  select id into bsso_id from public.lead_products where upper(code) = 'BSSO' limit 1;
  if pso_id is null or bsso_id is null then return; end if;

  insert into public.lead_stages (product_id, name, position, is_active)
  values
    (bsso_id, 'Pre BSSO', 1, true),
    (bsso_id, 'During BSSO', 2, true),
    (bsso_id, 'Post BSSO', 3, true)
  on conflict (product_id, name) do update
  set position = excluded.position,
      is_active = true;

  with stage_pairs as (
    select source.id as source_stage_id, target.id as target_stage_id
    from (values ('pre pso', 'pre bsso'), ('during pso', 'during bsso'), ('post pso', 'post bsso')) as names(source_name, target_name)
    join public.lead_stages source on source.product_id = pso_id and lower(source.name) = names.source_name and source.is_active
    join public.lead_stages target on target.product_id = bsso_id and lower(target.name) = names.target_name and target.is_active
  )
  insert into public.lead_stage_dropdowns (product_id, stage_id, label, position, is_active)
  select bsso_id, pairs.target_stage_id, source.label, source.position, source.is_active
  from stage_pairs pairs
  join public.lead_stage_dropdowns source on source.stage_id = pairs.source_stage_id
  where source.is_active
  on conflict (stage_id, label) do update
  set is_active = true;

  with stage_pairs as (
    select source.id as source_stage_id, target.id as target_stage_id
    from (values ('pre pso', 'pre bsso'), ('during pso', 'during bsso'), ('post pso', 'post bsso')) as names(source_name, target_name)
    join public.lead_stages source on source.product_id = pso_id and lower(source.name) = names.source_name and source.is_active
    join public.lead_stages target on target.product_id = bsso_id and lower(target.name) = names.target_name and target.is_active
  )
  insert into public.lead_stage_dropdown_options (dropdown_id, label, position, is_active)
  select target_dropdown.id, source_option.label, source_option.position, source_option.is_active
  from stage_pairs pairs
  join public.lead_stage_dropdowns source_dropdown on source_dropdown.stage_id = pairs.source_stage_id
  join public.lead_stage_dropdown_options source_option on source_option.dropdown_id = source_dropdown.id
  join public.lead_stage_dropdowns target_dropdown
    on target_dropdown.stage_id = pairs.target_stage_id
   and lower(trim(target_dropdown.label)) = lower(trim(source_dropdown.label))
  where source_option.is_active
  on conflict (dropdown_id, label) do update
  set position = excluded.position,
      is_active = true;
end $$;
