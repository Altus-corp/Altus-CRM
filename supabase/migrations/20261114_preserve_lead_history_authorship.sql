-- Keep historical CRM work attributable after an employee account is deleted.
-- Current lead ownership may be transferred to another CRM user, but the past
-- activity, call, and meeting must remain a record of the person who did it.

alter table public.lead_activities
  add column if not exists created_by_name text,
  add column if not exists created_by_email text;

alter table public.lead_call_log
  add column if not exists user_name text,
  add column if not exists user_email text;

alter table public.lead_google_meetings
  add column if not exists host_name text,
  add column if not exists host_email text;

alter table public.lead_zoom_meetings
  add column if not exists host_name text,
  add column if not exists host_email text;

-- Make this migration self-contained. These protections are intentionally
-- repeated from the earlier deletion-preparation migration so a production
-- project that missed it can be repaired by running this one script.
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

-- Call history previously cascaded when an auth account was deleted. Retain
-- it instead; the immutable name/email snapshot below identifies the former
-- employee while user_id is safely cleared.
alter table public.lead_call_log
  alter column user_id drop not null,
  drop constraint if exists lead_call_log_user_id_fkey,
  add constraint lead_call_log_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete set null;

create or replace function public.lead_history_actor_name(actor_id uuid)
returns table (display_name text, email_address text)
language sql
security definer
stable
set search_path = public, auth
as $$
  select
    coalesce(
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(account.email), ''),
      'Former CRM user'
    ),
    nullif(trim(account.email), '')
  from auth.users account
  left join public.profiles profile on profile.id = account.id
  where account.id = actor_id;
$$;

revoke all on function public.lead_history_actor_name(uuid) from public;
revoke all on function public.lead_history_actor_name(uuid) from anon;
revoke all on function public.lead_history_actor_name(uuid) from authenticated;

create or replace function public.snapshot_lead_activity_author()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor record;
begin
  if new.created_by is not null
     and (new.created_by_name is null or new.created_by_email is null) then
    select * into actor from public.lead_history_actor_name(new.created_by);
    new.created_by_name := coalesce(new.created_by_name, actor.display_name);
    new.created_by_email := coalesce(new.created_by_email, actor.email_address);
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_lead_call_author()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor record;
begin
  if new.user_id is not null
     and (new.user_name is null or new.user_email is null) then
    select * into actor from public.lead_history_actor_name(new.user_id);
    new.user_name := coalesce(new.user_name, actor.display_name);
    new.user_email := coalesce(new.user_email, actor.email_address);
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_google_meeting_host()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor record;
begin
  if new.host_user_id is not null
     and (new.host_name is null or new.host_email is null) then
    select * into actor from public.lead_history_actor_name(new.host_user_id);
    new.host_name := coalesce(new.host_name, actor.display_name);
    new.host_email := coalesce(new.host_email, actor.email_address);
  end if;
  return new;
end;
$$;

create or replace function public.snapshot_zoom_meeting_host()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor record;
begin
  if new.host_user_id is not null
     and (new.host_name is null or new.host_email is null) then
    select * into actor from public.lead_history_actor_name(new.host_user_id);
    new.host_name := coalesce(new.host_name, actor.display_name);
    new.host_email := coalesce(new.host_email, actor.email_address);
  end if;
  return new;
end;
$$;

drop trigger if exists snapshot_lead_activity_author on public.lead_activities;
create trigger snapshot_lead_activity_author
before insert or update of created_by on public.lead_activities
for each row execute function public.snapshot_lead_activity_author();

drop trigger if exists snapshot_lead_call_author on public.lead_call_log;
create trigger snapshot_lead_call_author
before insert or update of user_id on public.lead_call_log
for each row execute function public.snapshot_lead_call_author();

drop trigger if exists snapshot_google_meeting_host on public.lead_google_meetings;
create trigger snapshot_google_meeting_host
before insert or update of host_user_id on public.lead_google_meetings
for each row execute function public.snapshot_google_meeting_host();

drop trigger if exists snapshot_zoom_meeting_host on public.lead_zoom_meetings;
create trigger snapshot_zoom_meeting_host
before insert or update of host_user_id on public.lead_zoom_meetings
for each row execute function public.snapshot_zoom_meeting_host();

-- Populate snapshots for history created before this migration. Already
-- deleted accounts cannot be reconstructed, but all still-linked records are
-- protected before any future account deletion.
update public.lead_activities activity
set created_by_name = coalesce(
      activity.created_by_name,
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(account.email), ''),
      'Former CRM user'
    ),
    created_by_email = coalesce(activity.created_by_email, nullif(trim(account.email), ''))
from auth.users account
left join public.profiles profile on profile.id = account.id
where activity.created_by is not null
  and account.id = activity.created_by
  and (activity.created_by_name is null or activity.created_by_email is null);

update public.lead_call_log call_log
set user_name = coalesce(
      call_log.user_name,
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(account.email), ''),
      'Former CRM user'
    ),
    user_email = coalesce(call_log.user_email, nullif(trim(account.email), ''))
from auth.users account
left join public.profiles profile on profile.id = account.id
where call_log.user_id is not null
  and account.id = call_log.user_id
  and (call_log.user_name is null or call_log.user_email is null);

update public.lead_google_meetings meeting
set host_name = coalesce(
      meeting.host_name,
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(account.email), ''),
      'Former CRM user'
    ),
    host_email = coalesce(meeting.host_email, nullif(trim(account.email), ''))
from auth.users account
left join public.profiles profile on profile.id = account.id
where meeting.host_user_id is not null
  and account.id = meeting.host_user_id
  and (meeting.host_name is null or meeting.host_email is null);

update public.lead_zoom_meetings meeting
set host_name = coalesce(
      meeting.host_name,
      nullif(trim(profile.full_name), ''),
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
      nullif(trim(account.email), ''),
      'Former CRM user'
    ),
    host_email = coalesce(meeting.host_email, nullif(trim(account.email), ''))
from auth.users account
left join public.profiles profile on profile.id = account.id
where meeting.host_user_id is not null
  and account.id = meeting.host_user_id
  and (meeting.host_name is null or meeting.host_email is null);
