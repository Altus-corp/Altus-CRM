-- Actual Demo is an outcome calculated from product work shared with an
-- Ambassador. It is not a manually entered sales-user number.
create or replace function public.recalculate_ambassador_actual_demo(target_ambassador_id uuid)
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
  set ambassador_actual_demo = coalesce((
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
            (
              upper(btrim(product.code)) in ('KEYNOTE', 'RETAINER', 'AMBASSADOR')
              and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'pitched'
            )
            or (
              upper(btrim(product.code)) = 'ALTUS_OS'
              and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'demogiven'
            )
          )
      ), 0),
      updated_at = now()
  where ambassador_record.is_ambassador
    and ambassador_record.is_active
    and ambassador_record.ambassador_user_id = target_ambassador_id;
end;
$$;

-- A Channel Partner change can add or remove multiple outcomes at once.
create or replace function public.refresh_ambassador_actual_demo_from_channel_partner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalculate_ambassador_actual_demo(coalesce(new.ambassador_id, old.ambassador_id));
  if tg_op = 'UPDATE' and new.ambassador_id is distinct from old.ambassador_id then
    perform public.recalculate_ambassador_actual_demo(old.ambassador_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_demo_from_channel_partner on public.lead_channel_partners;
create trigger refresh_ambassador_actual_demo_from_channel_partner
after insert or update of ambassador_id or delete
on public.lead_channel_partners
for each row execute function public.refresh_ambassador_actual_demo_from_channel_partner();

-- Recalculate whenever a sales user changes the product outcome in the lead
-- table. Every selected Channel Partner for that lead is refreshed.
create or replace function public.refresh_ambassador_actual_demo_from_resolution()
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
    perform public.recalculate_ambassador_actual_demo(partner.ambassador_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_demo_from_resolution on public.lead_product_assignments;
create trigger refresh_ambassador_actual_demo_from_resolution
after update of latest_resolution_id, product_id
on public.lead_product_assignments
for each row execute function public.refresh_ambassador_actual_demo_from_resolution();

-- A newly matched Ambassador record must immediately show the outcomes that
-- were already shared with that Ambassador account.
create or replace function public.refresh_ambassador_actual_demo_from_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_ambassador and new.ambassador_user_id is not null then
    perform public.recalculate_ambassador_actual_demo(new.ambassador_user_id);
  end if;
  if tg_op = 'UPDATE' and old.ambassador_user_id is distinct from new.ambassador_user_id then
    perform public.recalculate_ambassador_actual_demo(old.ambassador_user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists refresh_ambassador_actual_demo_from_record on public.lead_product_assignments;
create trigger refresh_ambassador_actual_demo_from_record
after insert or update of is_ambassador, ambassador_user_id
on public.lead_product_assignments
for each row execute function public.refresh_ambassador_actual_demo_from_record();

-- Backfill all linked Ambassador records.
update public.lead_product_assignments ambassador_record
set ambassador_actual_demo = coalesce((
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
            upper(btrim(product.code)) in ('KEYNOTE', 'RETAINER', 'AMBASSADOR')
            and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'pitched'
          )
          or (
            upper(btrim(product.code)) = 'ALTUS_OS'
            and regexp_replace(lower(btrim(resolution.name)), '[^a-z0-9]+', '', 'g') = 'demogiven'
          )
        )
    ), 0),
    updated_at = now()
where ambassador_record.is_ambassador
  and ambassador_record.is_active
  and ambassador_record.ambassador_user_id is not null;
