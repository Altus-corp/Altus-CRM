-- Preserve product history while making removal and its fallback atomic.
alter table public.lead_product_assignments add column if not exists removed_from_crm boolean not null default false;

create or replace function public.crm_remove_product(p_lead uuid, p_assignment uuid, p_actor uuid, p_allowed_owners uuid[], p_admin boolean)
returns void language plpgsql security invoker set search_path = public as $$
declare a public.lead_product_assignments%rowtype; fallback_id uuid;
begin
  perform 1 from public.leads where id = p_lead for update;
  select * into a from public.lead_product_assignments where id = p_assignment and lead_id = p_lead and is_active for update;
  if not found then raise exception 'Product assignment is no longer active.'; end if;
  if not p_admin and (a.assigned_to is null or not (a.assigned_to = any(p_allowed_owners))) then raise exception 'You cannot remove this product assignment.'; end if;
  if a.is_ambassador then raise exception 'Established Ambassador assignments cannot yet be removed because the existing Ambassador workflow keeps them active.'; end if;
  if not exists (select 1 from public.lead_product_assignments where lead_id = p_lead and is_active and id <> p_assignment) then
    select id into fallback_id from public.lead_products where upper(trim(code)) = 'UNCATEGORIZED' and is_active limit 1;
    if fallback_id is null then raise exception 'Uncategorized product is not configured.'; end if;
    if a.product_id = fallback_id then raise exception 'A lead must retain an active product.'; end if;
    insert into public.lead_product_assignments (lead_id, product_id, assigned_to, assigned_at, created_by, is_active, removed_from_crm)
    values (p_lead, fallback_id, a.assigned_to, now(), p_actor, true, false)
    on conflict (lead_id, product_id) do update set is_active = true, is_closed = false, assigned_to = excluded.assigned_to, removed_from_crm = false, updated_at = now();
  end if;
  update public.lead_product_assignments set is_active = false, removed_from_crm = true, updated_at = now() where id = p_assignment;
  if exists (select 1 from public.lead_product_assignments where id = p_assignment and is_active) then raise exception 'Product could not be deactivated by the existing workflow.'; end if;
  insert into public.lead_activities (lead_id, lead_product_assignment_id, activity_type, note, created_by)
  values (p_lead, p_assignment, 'product_updated', 'Product removed from active work; history retained.', p_actor);
end $$;
revoke all on function public.crm_remove_product(uuid, uuid, uuid, uuid[], boolean) from public, anon, authenticated;
grant execute on function public.crm_remove_product(uuid, uuid, uuid, uuid[], boolean) to service_role;

-- Apply a complete product selection in one transaction, without deleting history.
create or replace function public.crm_select_products(p_lead uuid, p_source uuid, p_actor uuid, p_allowed_owners uuid[], p_admin boolean, p_expected uuid[], p_selected uuid[])
returns void language plpgsql security invoker set search_path = public as $$
declare src public.lead_product_assignments%rowtype; a record; pid uuid; assignment_id uuid; fallback_id uuid; current_ids uuid[]; actual_ids uuid[];
begin
  perform 1 from public.leads where id = p_lead for update;
  if not found then raise exception 'Lead not found.'; end if;
  select * into src from public.lead_product_assignments where id = p_source and lead_id = p_lead and is_active for update;
  if not found then raise exception 'The source assignment is no longer active.'; end if;
  if not p_admin and (src.assigned_to is null or not (src.assigned_to = any(p_allowed_owners))) then raise exception 'You cannot change products for this assignment.'; end if;
  select coalesce(array_agg(product_id order by product_id), '{}'::uuid[]) into current_ids from public.lead_product_assignments where lead_id = p_lead and is_active;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into actual_ids from unnest(coalesce(p_expected, '{}'::uuid[])) x;
  if current_ids <> actual_ids then raise exception 'Products changed since this picker was opened. Reopen it and try again.'; end if;
  select id into fallback_id from public.lead_products where upper(trim(code)) = 'UNCATEGORIZED' and is_active limit 1;
  if fallback_id is null then raise exception 'Uncategorized product is not configured.'; end if;
  select coalesce(array_agg(distinct x order by x), '{}'::uuid[]) into actual_ids from unnest(coalesce(p_selected, '{}'::uuid[])) x where x <> fallback_id;
  if cardinality(actual_ids) > 100 then raise exception 'Too many products selected.'; end if;
  if exists (select 1 from unnest(actual_ids) x where not exists (select 1 from public.lead_products p where p.id = x and p.is_active)) then raise exception 'A selected product is unavailable.'; end if;
  if cardinality(actual_ids) = 0 then actual_ids := array[fallback_id]; end if;
  for a in select * from public.lead_product_assignments where lead_id = p_lead and is_active and not (product_id = any(actual_ids)) for update loop
    if not p_admin and (a.assigned_to is null or not (a.assigned_to = any(p_allowed_owners))) then raise exception 'You cannot remove a product assigned to another user.'; end if;
    if a.is_ambassador then raise exception 'Established Ambassador assignments cannot yet be removed because the existing Ambassador workflow keeps them active.'; end if;
  end loop;
  foreach pid in array actual_ids loop
    select * into a from public.lead_product_assignments where lead_id = p_lead and product_id = pid for update;
    if found and not a.is_active then
      if not a.removed_from_crm and pid <> fallback_id then raise exception 'This product has inactive work managed by another workflow.'; end if;
      if not p_admin and (a.assigned_to is null or not (a.assigned_to = any(p_allowed_owners))) then raise exception 'Only the owner, their manager, or an admin can restore this product.'; end if;
      update public.lead_product_assignments set is_active = true, removed_from_crm = false, assigned_to = case when pid = fallback_id then src.assigned_to else assigned_to end, updated_at = now() where id = a.id;
      insert into public.lead_activities (lead_id, lead_product_assignment_id, activity_type, note, created_by) values (p_lead, a.id, 'product_added', 'Product restored from the lead table.', p_actor);
    elsif not found then
      insert into public.lead_product_assignments (lead_id, product_id, assigned_to, assigned_at, created_by) values (p_lead, pid, src.assigned_to, now(), p_actor) returning id into assignment_id;
      insert into public.lead_activities (lead_id, lead_product_assignment_id, activity_type, note, created_by) values (p_lead, assignment_id, 'product_added', 'Product added from the lead table.', p_actor);
    end if;
  end loop;
  for a in select * from public.lead_product_assignments where lead_id = p_lead and is_active and not (product_id = any(actual_ids)) for update loop
    update public.lead_product_assignments set is_active = false, removed_from_crm = true, updated_at = now() where id = a.id;
    if exists (select 1 from public.lead_product_assignments where id = a.id and is_active) then raise exception 'Product could not be deactivated by the existing workflow.'; end if;
    insert into public.lead_activities (lead_id, lead_product_assignment_id, activity_type, note, created_by) values (p_lead, a.id, 'product_updated', 'Product removed from active work; history retained.', p_actor);
  end loop;
end $$;
revoke all on function public.crm_select_products(uuid, uuid, uuid, uuid[], boolean, uuid[], uuid[]) from public, anon, authenticated;
grant execute on function public.crm_select_products(uuid, uuid, uuid, uuid[], boolean, uuid[], uuid[]) to service_role;
