create table public.crm_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  manager_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index crm_teams_name_idx on public.crm_teams (lower(btrim(name)));
create index crm_teams_manager_idx on public.crm_teams(manager_id);

create table public.crm_team_members (
  team_id uuid not null references public.crm_teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, user_id)
);
create index crm_team_members_user_idx on public.crm_team_members(user_id);
alter table public.crm_teams enable row level security;
alter table public.crm_team_members enable row level security;
-- Team management is available only through authenticated admin server actions.

create function public.save_crm_team(p_team_id uuid, p_name text, p_manager_id uuid, p_member_ids uuid[])
returns uuid language plpgsql set search_path = public as $$
declare saved_id uuid;
begin
  if not exists (
    select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = p_manager_id and r.role = 'sales_manager' and not coalesce(p.is_suspended, false)
  ) then raise exception 'Choose an active sales manager.'; end if;
  if p_manager_id = any(p_member_ids) then raise exception 'The manager cannot also be a team member.'; end if;
  if exists (
    select 1 from unnest(p_member_ids) member_id
    where not exists (select 1 from public.profiles p where p.id = member_id and not coalesce(p.is_suspended, false))
      or not exists (select 1 from public.user_roles r where r.user_id = member_id)
  ) then raise exception 'Choose active CRM users as members.'; end if;

  if p_team_id is null then
    insert into public.crm_teams(name, manager_id) values (btrim(p_name), p_manager_id) returning id into saved_id;
  else
    update public.crm_teams set name = btrim(p_name), manager_id = p_manager_id where id = p_team_id returning id into saved_id;
    if saved_id is null then raise exception 'Team not found.'; end if;
  end if;
  delete from public.crm_team_members where team_id = saved_id;
  insert into public.crm_team_members(team_id, user_id)
    select saved_id, member_id from (select distinct unnest(p_member_ids) as member_id) members;
  return saved_id;
end;
$$;
revoke all on function public.save_crm_team(uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.save_crm_team(uuid, text, uuid, uuid[]) to service_role;
