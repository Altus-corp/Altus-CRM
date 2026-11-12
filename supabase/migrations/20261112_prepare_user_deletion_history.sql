-- Deleting a CRM account must retain leads, activities, and historical
-- meetings. The Admin Users workflow transfers current ownership first; these
-- foreign keys then safely clear the former account from historical records.

alter table public.leads
  alter column created_by drop not null,
  drop constraint if exists leads_created_by_fkey,
  add constraint leads_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null,
  drop constraint if exists leads_ambassador_imported_by_fkey,
  add constraint leads_ambassador_imported_by_fkey
    foreign key (ambassador_imported_by) references auth.users(id) on delete set null;

alter table public.lead_activities
  alter column created_by drop not null,
  drop constraint if exists lead_activities_created_by_fkey,
  add constraint lead_activities_created_by_fkey
    foreign key (created_by) references auth.users(id) on delete set null;

alter table public.lead_google_meetings
  alter column host_user_id drop not null,
  drop constraint if exists lead_google_meetings_host_user_id_fkey,
  add constraint lead_google_meetings_host_user_id_fkey
    foreign key (host_user_id) references auth.users(id) on delete set null;

alter table public.lead_zoom_meetings
  alter column host_user_id drop not null,
  drop constraint if exists lead_zoom_meetings_host_user_id_fkey,
  add constraint lead_zoom_meetings_host_user_id_fkey
    foreign key (host_user_id) references auth.users(id) on delete set null;

alter table public.lead_round_robin_schedule
  drop constraint if exists lead_round_robin_schedule_updated_by_fkey,
  add constraint lead_round_robin_schedule_updated_by_fkey
    foreign key (updated_by) references auth.users(id) on delete set null;
