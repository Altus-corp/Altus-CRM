-- Post PSO uses admin-defined stage dropdowns for Sales Resolution.  The
-- original paid-transfer automation listened only to latest_resolution_id,
-- therefore a "Deposit Paid" choice in the stage table did not start PS.
-- Keep both inputs on one shared database function so every write path is
-- consistent.

create or replace function public.transfer_paid_post_pso_assignment(
  p_assignment_id uuid,
  p_resolution_name text,
  p_actor_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution_key text := lower(regexp_replace(trim(coalesce(p_resolution_name, '')), '[,_[:space:]-]+', ' ', 'g'));
  source_assignment public.lead_product_assignments%rowtype;
  source_product_code text;
  source_stage_name text;
  ps_product_id uuid;
  pre_ps_stage_id uuid;
  ps_assignment_id uuid;
  actor_id uuid;
  focus_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if resolution_key not in ('deposit paid', 'fully paid') then
    return false;
  end if;

  select * into source_assignment
  from public.lead_product_assignments
  where id = p_assignment_id
  for update;

  if not found or not source_assignment.is_active or source_assignment.is_closed then
    return false;
  end if;

  select upper(product.code), lower(trim(stage.name))
    into source_product_code, source_stage_name
  from public.lead_products product
  left join public.lead_stages stage on stage.id = source_assignment.stage_id
  where product.id = source_assignment.product_id;

  if source_product_code <> 'PSO' or source_stage_name <> 'post pso' then
    return false;
  end if;

  select id into ps_product_id
  from public.lead_products
  where upper(code) = 'PS' and is_active = true
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

  actor_id := coalesce(p_actor_id, source_assignment.assigned_to, source_assignment.created_by);

  update public.lead_product_assignments
  set is_active = false,
      is_closed = true,
      focused_on = null,
      next_follow_up_at = null,
      updated_at = now()
  where id = source_assignment.id;

  insert into public.lead_product_assignments (
    lead_id, product_id, stage_id, assigned_to, assigned_at, focused_on,
    is_active, is_closed, created_by
  ) values (
    source_assignment.lead_id, ps_product_id, pre_ps_stage_id,
    source_assignment.assigned_to, coalesce(source_assignment.assigned_at, now()),
    focus_date, true, false, actor_id
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
  ) values
    (
      source_assignment.lead_id, source_assignment.id, 'product_transfer_completed',
      'PSO completed after payment. Lead transferred to PS Onboarding.',
      jsonb_build_object('destination_product', 'PS', 'destination_stage', 'Pre PS', 'resolution', p_resolution_name), actor_id
    ),
    (
      source_assignment.lead_id, ps_assignment_id, 'product_transferred',
      'Lead transferred from Post PSO to PS Onboarding (Pre PS).',
      jsonb_build_object('source_product', 'PSO', 'source_stage', 'Post PSO', 'resolution', p_resolution_name), actor_id
    );

  return true;
end;
$$;

-- Replace the first version's trigger body so Activity Resolution selections
-- and stage-dropdown selections share the exact same transfer logic.
create or replace function public.transfer_paid_post_pso_to_ps_onboarding()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolution_name text;
begin
  if new.latest_resolution_id is not null then
    select name into resolution_name
    from public.lead_resolutions
    where id = new.latest_resolution_id;
    perform public.transfer_paid_post_pso_assignment(new.id, resolution_name, new.assigned_to);
  end if;
  return new;
end;
$$;

create or replace function public.transfer_paid_post_pso_from_stage_dropdown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dropdown_label text;
  option_label text;
begin
  select dropdown.label, option.label
    into dropdown_label, option_label
  from public.lead_stage_dropdowns dropdown
  join public.lead_stage_dropdown_options option on option.id = new.option_id
  where dropdown.id = new.dropdown_id
    and option.dropdown_id = dropdown.id;

  -- Allow punctuation/plural variations created by admins.
  if regexp_replace(lower(coalesce(dropdown_label, '')), '[^a-z0-9]+', '', 'g')
       in ('salesresolution', 'salesresolutions') then
    perform public.transfer_paid_post_pso_assignment(
      new.assignment_id,
      option_label,
      new.updated_by
    );
  end if;
  return new;
end;
$$;

drop trigger if exists transfer_paid_post_pso_from_stage_dropdown on public.lead_stage_dropdown_values;
create trigger transfer_paid_post_pso_from_stage_dropdown
after insert or update of option_id
on public.lead_stage_dropdown_values
for each row
execute function public.transfer_paid_post_pso_from_stage_dropdown();
