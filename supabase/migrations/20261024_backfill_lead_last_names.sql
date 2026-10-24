-- Earlier imports could store an admin-created "Last Name" field in custom_data.
-- Copy it to the real leads.last_name column without deleting the original JSON value.
do $$
declare
  custom_last_name_key text;
begin
  for custom_last_name_key in
    select field_key
    from public.lead_table_columns
    where regexp_replace(lower(label), '[^a-z0-9]+', '', 'g') = 'lastname'
  loop
    execute format(
      'update public.leads
       set last_name = nullif(btrim(custom_data ->> %1$L), '''')
       where nullif(btrim(last_name), '''') is null
         and nullif(btrim(custom_data ->> %1$L), '''') is not null',
      custom_last_name_key
    );
  end loop;
end $$;
