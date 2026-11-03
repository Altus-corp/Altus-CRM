-- A paid PSO attendee starts the PS onboarding journey. This runs in the
-- database so table edits, product boards, and future API writes stay aligned.
create or replace function public.transfer_paid_post_pso_to_ps_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution_key text;
  source_product_code text;
  source_stage_name text;
  ps_product_id uuid;
  pre_ps_stage_id uuid;
  ps_assignment_id uuid;
  focus_date date;
begin
  if new.latest_resolution_id is null then
    return new;
  end if;

  select lower(regexp_replace(trim(name), '[,_[:space:]-]+', ' ', 'g'))
    into resolution_key
  from public.lead_resolutions
  where id = new.latest_resolution_id;

  if resolution_key not in ('deposit paid', 'fully paid') then
    return new;
  end if;

  select upper(product.code), lower(trim(stage.name))
    into source_product_code, source_stage_name
  from public.lead_products product
  left join public.lead_stages stage on stage.id = new.stage_id
  where product.id = new.product_id;

  if source_product_code <> 'PSO' or source_stage_name <> 'post pso' then
    return new;
  end if;

  select id into ps_product_id
  from public.lead_products
  where upper(code) = 'PS'
    and is_active = true
  limit 1;

  if ps_product_id is null then
    raise exception 'PS product must be configured before transferring a paid Post PSO lead.';
  end if;

  select id into pre_ps_stage_id
  from public.lead_stages
  where product_id = ps_product_id
    and lower(trim(name)) = 'pre ps'
    and is_active = true
  order by position
  limit 1;

  if pre_ps_stage_id is null then
    raise exception 'Pre PS stage must be configured before transferring a paid Post PSO lead.';
  end if;

  focus_date := (now() at time zone 'Asia/Kolkata')::date;

  -- Complete the orientation work. The history remains intact but it no
  -- longer appears in Post PSO or active PSO queues.
  update public.lead_product_assignments
  set is_active = false,
      is_closed = true,
      focused_on = null,
      next_follow_up_at = null,
      updated_at = now()
  where id = new.id;

  -- A lead may already have PS work. In that case revive it at Pre PS rather
  -- than creating duplicate product work.
  insert into public.lead_product_assignments (
    lead_id, product_id, stage_id, assigned_to, assigned_at, focused_on,
    is_active, is_closed, created_by
  )
  values (
    new.lead_id, ps_product_id, pre_ps_stage_id, new.assigned_to,
    coalesce(new.assigned_at, now()), focus_date, true, false, auth.uid()
  )
  on conflict (lead_id, product_id) do update
  set stage_id = excluded.stage_id,
      assigned_to = excluded.assigned_to,
      assigned_at = excluded.assigned_at,
      focused_on = excluded.focused_on,
      is_active = true,
      is_closed = false,
      next_follow_up_at = null,
      updated_at = now()
  returning id into ps_assignment_id;

  insert into public.lead_activities (
    lead_id, lead_product_assignment_id, activity_type, note, metadata, created_by
  )
  values
    (
      new.lead_id, new.id, 'product_transfer_completed',
      'PSO completed after payment. Lead transferred to PS Onboarding.',
      jsonb_build_object('destination_product', 'PS', 'destination_stage', 'Pre PS', 'resolution_id', new.latest_resolution_id),
      auth.uid()
    ),
    (
      new.lead_id, ps_assignment_id, 'product_transferred',
      'Lead transferred from Post PSO to PS Onboarding (Pre PS).',
      jsonb_build_object('source_product', 'PSO', 'source_stage', 'Post PSO', 'resolution_id', new.latest_resolution_id),
      auth.uid()
    );

  return new;
end;
$$;

drop trigger if exists transfer_paid_post_pso_to_ps_onboarding on public.lead_product_assignments;
create trigger transfer_paid_post_pso_to_ps_onboarding
after update of latest_resolution_id
on public.lead_product_assignments
for each row
when (new.latest_resolution_id is distinct from old.latest_resolution_id)
execute function public.transfer_paid_post_pso_to_ps_onboarding();
