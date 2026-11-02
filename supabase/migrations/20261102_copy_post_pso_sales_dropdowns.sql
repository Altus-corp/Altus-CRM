-- Post PSO has its own stage configuration. If the sales dropdowns were
-- originally created on another PSO stage, copy those definitions and options
-- into Post PSO so they appear in the Post PSO table as well.
do $$
declare
  pso_id uuid;
  post_pso_id uuid;
begin
  select id into pso_id from public.lead_products where upper(code) = 'PSO' limit 1;
  if pso_id is null then return; end if;

  select id into post_pso_id
  from public.lead_stages
  where product_id = pso_id
    and lower(name) = 'post pso'
    and is_active
  limit 1;
  if post_pso_id is null then return; end if;

  with source_dropdowns as (
    select distinct on (lower(dropdown.label))
      dropdown.id,
      dropdown.label,
      dropdown.position,
      dropdown.is_active
    from public.lead_stage_dropdowns dropdown
    where dropdown.product_id = pso_id
      and dropdown.stage_id <> post_pso_id
      and lower(trim(dropdown.label)) in (
        'brochure & payment detail sent',
        'sales follow up by',
        'sales resolution'
      )
    order by lower(dropdown.label), dropdown.position, dropdown.created_at
  )
  insert into public.lead_stage_dropdowns (product_id, stage_id, label, position, is_active)
  select pso_id, post_pso_id, source.label, source.position, source.is_active
  from source_dropdowns source
  on conflict (stage_id, label) do update
  set is_active = true;

  insert into public.lead_stage_dropdown_options (dropdown_id, label, position, is_active)
  select target.id, source_option.label, source_option.position, source_option.is_active
  from public.lead_stage_dropdowns source
  join public.lead_stage_dropdown_options source_option on source_option.dropdown_id = source.id
  join public.lead_stage_dropdowns target
    on target.stage_id = post_pso_id
   and lower(trim(target.label)) = lower(trim(source.label))
  where source.product_id = pso_id
    and source.stage_id <> post_pso_id
    and lower(trim(source.label)) in (
      'brochure & payment detail sent',
      'sales follow up by',
      'sales resolution'
    )
  on conflict (dropdown_id, label) do update
  set position = excluded.position,
      is_active = excluded.is_active;
end $$;
