-- Link is a shared lead-field type. Values are validated by the CRM server
-- to require an https:// or www. prefix before they are saved.
alter type public.lead_field_type add value if not exists 'link';
