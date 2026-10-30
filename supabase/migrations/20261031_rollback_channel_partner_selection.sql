-- Roll back 20261031_add_channel_partner_selection.sql.
-- This deletes saved Channel Partner selections, but preserves leads,
-- Ambassador accounts, import provenance, and round-robin exclusions.
begin;

drop trigger if exists zz_initialize_lead_channel_partners on public.leads;
drop function if exists public.initialize_lead_channel_partners();
alter table public.leads drop column if exists channel_partner_ids;

commit;
