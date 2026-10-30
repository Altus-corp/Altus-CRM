-- The role enum predates the repository's lead migrations.
alter type public.app_role add value if not exists 'ambassador';

alter table public.leads add column if not exists ambassador_imported_by uuid references auth.users(id);
create index if not exists leads_ambassador_importer_idx on public.leads(ambassador_imported_by, created_at desc);
alter table public.lead_product_assignments add column if not exists exclude_from_round_robin boolean not null default false;

create or replace function public.mark_ambassador_import()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.ambassador_imported_by := null;
    if exists (select 1 from public.user_roles where user_id = new.created_by and role::text = 'ambassador')
      and not exists (select 1 from public.user_roles where user_id = new.created_by and role::text = 'admin') then
      new.ambassador_imported_by := new.created_by;
      new.assigned_to := new.created_by;
      new.assigned_at := now();
    end if;
  else
    new.ambassador_imported_by := old.ambassador_imported_by;
  end if;
  return new;
end;
$$;
drop trigger if exists mark_ambassador_import on public.leads;
create trigger mark_ambassador_import before insert or update on public.leads
for each row execute function public.mark_ambassador_import();

create or replace function public.protect_ambassador_import_from_round_robin()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare importer uuid;
begin
  select ambassador_imported_by into importer from public.leads where id = new.lead_id;
  new.exclude_from_round_robin := importer is not null;
  if importer is not null and new.assignment_origin = 'round_robin' then
    raise exception 'Ambassador imports cannot enter round robin.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_ambassador_import_from_round_robin on public.lead_product_assignments;
create trigger protect_ambassador_import_from_round_robin before insert or update on public.lead_product_assignments
for each row execute function public.protect_ambassador_import_from_round_robin();

drop policy if exists "Ambassadors add product work to their imports" on public.lead_product_assignments;
create policy "Ambassadors add product work to their imports" on public.lead_product_assignments
for insert to authenticated with check (
  created_by = (select auth.uid()) and assigned_to = (select auth.uid())
  and exists (select 1 from public.user_roles where user_id = (select auth.uid()) and role::text = 'ambassador')
  and exists (select 1 from public.leads where id = lead_id and ambassador_imported_by = (select auth.uid()))
);
