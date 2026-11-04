-- Actual Proposal is calculated from qualifying product outcomes for leads
-- shared with an Ambassador. Sales users do not enter it manually.
create or replace function public.recalculate_ambassador_actual_proposals(target_ambassador_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_ambassador_id is null then
    return;
  end if;

  update public.lead_product_assignments ambassador_record
  set ambassador_actual_proposals = coalesce((
        select count(distinct work.lead_id)
        from public.lead_channel_partners partner
        join public.lead_product_assignments work
          on work.lead_id = partner.lead_id
        join public.lead_products product
          on product.id = work.product_id
        join public.lead_resolutions resolution
          on resolution.id = work.latest_resolution_id
        where partner.ambassador_id = target_ambassador_id
          and (
            upper(btrim(product.code)) in ('KEYNOTE', 'RETAINER', 'ALTUS_OS')
            and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'proposalsent'
            or (
              upper(btrim(product.code)) = 'AMBASSADOR'
              and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'agreementsent'
            )
          )
      ), 0),
      updated_at = now()
  where ambassador_record.is_ambassador
    and ambassador_record.is_active
    and ambassador_record.ambassador_user_id = target_ambassador_id;
end;
$$;

create or replace function public.refresh_ambassador_actual_proposals_from_channel_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_ambassador_actual_proposals(coalesce(new.ambassador_id, old.ambassador_id));
  if tg_op = 'UPDATE' and new.ambassador_id is distinct from old.ambassador_id then
    perform public.recalculate_ambassador_actual_proposals(old.ambassador_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_proposals_from_channel_partner on public.lead_channel_partners;
create trigger refresh_ambassador_actual_proposals_from_channel_partner
after insert or update of ambassador_id or delete
on public.lead_channel_partners
for each row execute function public.refresh_ambassador_actual_proposals_from_channel_partner();

create or replace function public.refresh_ambassador_actual_proposals_from_resolution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  partner record;
begin
  for partner in
    select ambassador_id
    from public.lead_channel_partners
    where lead_id = new.lead_id
  loop
    perform public.recalculate_ambassador_actual_proposals(partner.ambassador_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_proposals_from_resolution on public.lead_product_assignments;
create trigger refresh_ambassador_actual_proposals_from_resolution
after update of latest_resolution_id, product_id
on public.lead_product_assignments
for each row execute function public.refresh_ambassador_actual_proposals_from_resolution();

create or replace function public.refresh_ambassador_actual_proposals_from_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_ambassador and new.ambassador_user_id is not null then
    perform public.recalculate_ambassador_actual_proposals(new.ambassador_user_id);
  end if;
  if tg_op = 'UPDATE' and old.ambassador_user_id is distinct from new.ambassador_user_id then
    perform public.recalculate_ambassador_actual_proposals(old.ambassador_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_proposals_from_record on public.lead_product_assignments;
create trigger refresh_ambassador_actual_proposals_from_record
after insert or update of is_ambassador, ambassador_user_id
on public.lead_product_assignments
for each row execute function public.refresh_ambassador_actual_proposals_from_record();

update public.lead_product_assignments ambassador_record
set ambassador_actual_proposals = coalesce((
      select count(distinct work.lead_id)
      from public.lead_channel_partners partner
      join public.lead_product_assignments work
        on work.lead_id = partner.lead_id
      join public.lead_products product
        on product.id = work.product_id
      join public.lead_resolutions resolution
        on resolution.id = work.latest_resolution_id
      where partner.ambassador_id = ambassador_record.ambassador_user_id
        and (
          (
            upper(btrim(product.code)) in ('KEYNOTE', 'RETAINER', 'ALTUS_OS')
            and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'proposalsent'
          )
          or (
            upper(btrim(product.code)) = 'AMBASSADOR'
            and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'agreementsent'
          )
        )
    ), 0),
    updated_at = now()
where ambassador_record.is_ambassador
  and ambassador_record.is_active
  and ambassador_record.ambassador_user_id is not null;
