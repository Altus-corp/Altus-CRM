-- Ensure the three standard Post PSO dropdowns exist even if the original
-- admin labels used punctuation/plural variants such as "Follow-Up" or
-- "Sales Resolutions". Existing values are never removed.
do $$
declare
  pso_id uuid;
  post_pso_id uuid;
begin
  select id into pso_id from public.lead_products where upper(code) = 'PSO' limit 1;
  if pso_id is null then return; end if;

  select id into post_pso_id
  from public.lead_stages
  where product_id = pso_id and lower(name) = 'post pso' and is_active
  limit 1;
  if post_pso_id is null then return; end if;

  insert into public.lead_stage_dropdowns (product_id, stage_id, label, position, is_active)
  values
    (pso_id, post_pso_id, 'Brochure & Payment Detail Sent', 1, true),
    (pso_id, post_pso_id, 'Sales Follow Up By', 2, true),
    (pso_id, post_pso_id, 'Sales Resolution', 3, true)
  on conflict (stage_id, label) do update set is_active = true;

  -- Copy choices from the same PSO dropdown fields on any other stage. Label
  -- normalization makes "Follow-Up", spacing, and plural punctuation safe.
  insert into public.lead_stage_dropdown_options (dropdown_id, label, position, is_active)
  select distinct on (target.id, lower(source_option.label))
    target.id, source_option.label, source_option.position, source_option.is_active
  from public.lead_stage_dropdowns source
  join public.lead_stage_dropdown_options source_option on source_option.dropdown_id = source.id
  join public.lead_stage_dropdowns target
    on target.stage_id = post_pso_id
   and (
      regexp_replace(lower(target.label), '[^a-z0-9]+', '', 'g') =
      regexp_replace(lower(source.label), '[^a-z0-9]+', '', 'g')
      or (
        regexp_replace(lower(target.label), '[^a-z0-9]+', '', 'g') = 'salesresolution'
        and regexp_replace(lower(source.label), '[^a-z0-9]+', '', 'g') in ('salesresolution', 'salesresolutions')
      )
   )
  where source.product_id = pso_id
    and source.stage_id <> post_pso_id
    and regexp_replace(lower(source.label), '[^a-z0-9]+', '', 'g') in (
      'brochurepaymentdetailsent',
      'salesfollowupby',
      'salesresolution',
      'salesresolutions'
    )
  order by target.id, lower(source_option.label), source_option.position
  on conflict (dropdown_id, label) do update
  set position = excluded.position,
      is_active = excluded.is_active;
end $$;
