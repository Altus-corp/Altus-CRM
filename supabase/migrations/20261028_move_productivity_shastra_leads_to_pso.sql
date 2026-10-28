-- Productivity Shastra is a PSO source. Correct the leads imported before
-- the source-to-product rule was fixed, while preserving their assignment IDs.
do $$
declare
  pso_id uuid;
begin
  select id into pso_id
  from public.lead_products
  where upper(code) = 'PSO' and is_active
  limit 1;

  if pso_id is null then
    raise exception 'Active PSO product is required.';
  end if;

  update public.lead_product_assignments assignment
  set product_id = pso_id,
      stage_id = null,
      latest_resolution_id = null,
      updated_at = now()
  where exists (
    select 1
    from public.leads lead
    where lead.id = assignment.lead_id
      and lead.external_source = 'productivity_shastra'
      and lead.lead_database = 'qualified_leads'
  )
    and assignment.product_id <> pso_id
    and not exists (
      select 1
      from public.lead_product_assignments existing
      where existing.lead_id = assignment.lead_id
        and existing.product_id = pso_id
    );

  update public.leads
  set product_id = pso_id,
      stage_id = null,
      latest_resolution_id = null,
      updated_at = now()
  where external_source = 'productivity_shastra'
    and lead_database = 'qualified_leads';
end $$;
