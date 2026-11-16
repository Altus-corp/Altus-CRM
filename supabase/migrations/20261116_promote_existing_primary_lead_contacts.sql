-- The initial contacts rollout stored a Primary contact as a child row. The
-- CRM now treats the leads row as the canonical Primary contact. Promote any
-- existing child Primary rows while saving the former lead contact as Secondary.
do $$
declare
  candidate record;
  current_lead record;
  designation_key text;
  department_key text;
  next_custom_data jsonb;
begin
  select field_key into designation_key
  from public.lead_table_columns
  where source = 'custom'
    and field_type = 'dropdown'
    and regexp_replace(lower(label), '[^a-z0-9]+', '', 'g') = 'designation'
  order by position, id
  limit 1;

  select field_key into department_key
  from public.lead_table_columns
  where source = 'custom'
    and field_type = 'dropdown'
    and regexp_replace(lower(label), '[^a-z0-9]+', '', 'g') = 'departmentfunction'
  order by position, id
  limit 1;

  for candidate in
    select distinct on (lead_id) *
    from public.lead_contacts
    where contact_type = 'primary'
    order by lead_id, created_at desc, id desc
  loop
    select first_name, last_name, email, custom_data
      into current_lead
    from public.leads
    where id = candidate.lead_id;

    if not found then
      continue;
    end if;

    insert into public.lead_contacts (
      lead_id, first_name, last_name, email, designation, department_function,
      contact_type, created_by
    ) values (
      candidate.lead_id,
      current_lead.first_name,
      current_lead.last_name,
      current_lead.email,
      case when designation_key is null then null else nullif(current_lead.custom_data ->> designation_key, '') end,
      case when department_key is null then null else nullif(current_lead.custom_data ->> department_key, '') end,
      'secondary',
      candidate.created_by
    );

    next_custom_data := coalesce(current_lead.custom_data, '{}'::jsonb);
    if designation_key is not null then
      next_custom_data := jsonb_set(next_custom_data, array[designation_key], to_jsonb(coalesce(candidate.designation, '')), true);
    end if;
    if department_key is not null then
      next_custom_data := jsonb_set(next_custom_data, array[department_key], to_jsonb(coalesce(candidate.department_function, '')), true);
    end if;

    update public.leads
    set first_name = candidate.first_name,
        last_name = candidate.last_name,
        email = candidate.email,
        custom_data = next_custom_data,
        updated_at = now()
    where id = candidate.lead_id;

    delete from public.lead_contacts where id = candidate.id;
  end loop;
end;
