-- Register the built-in address fields in Columns Management without changing lead data.
-- Existing matching custom columns are retained and take precedence.
with address_fields(field_key, label, field_type, aliases) as (
  values
    ('address_line_1', 'Address Line 1 - House No/ Flat No/ Building Name', 'text', array['addressline1', 'housenoflatnobuildingname']),
    ('address_line_2', 'Address Line 2 - Street Name', 'text', array['addressline2', 'streetname']),
    ('address_line_3', 'Address Line 3 - Locality Name', 'text', array['addressline3', 'localityname']),
    ('address_line_4', 'Address Line 4 - Area Name', 'text', array['addressline4', 'areaname']),
    ('nearby_landmark', 'Nearby Landmark', 'text', array['nearbylandmark', 'landmark']),
    ('city', 'City', 'dropdown', array['city']),
    ('pincode', 'Pincode', 'text', array['pincode', 'postalcode', 'zipcode']),
    ('country', 'Country', 'dropdown', array['country']),
    ('state', 'State', 'dropdown', array['state']),
    ('google_map', 'Google Map', 'link', array['googlemap', 'googlemaps', 'maplink'])
)
insert into public.lead_table_columns (field_key, label, source, field_type, options, is_visible, position)
select f.field_key, f.label, 'custom', f.field_type::public.lead_field_type,
       case when f.field_key = 'country' then '["India"]'::jsonb else '[]'::jsonb end,
       false, coalesce((select max(position) from public.lead_table_columns), 0) + row_number() over ()
from address_fields f
where not exists (
  select 1 from public.lead_table_columns c
  where c.field_key = f.field_key
     or regexp_replace(lower(trim(c.field_key)), '[^a-z0-9]+', '', 'g') = any(f.aliases)
     or regexp_replace(lower(trim(c.label)), '[^a-z0-9]+', '', 'g') = any(f.aliases)
)
on conflict (field_key) do nothing;
