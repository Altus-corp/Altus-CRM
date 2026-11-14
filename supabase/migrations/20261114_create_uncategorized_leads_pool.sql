-- Uncategorized is a safe holding pool for leads that arrive without a
-- product, as well as leads explicitly marked with the Uncategorized product.
-- It keeps those records out of normal product queues until an admin reviews
-- and assigns them.

do $$
declare
  uncategorized_product_id uuid;
begin
  select id
    into uncategorized_product_id
  from public.lead_products
  where upper(btrim(code)) = 'UNCATEGORIZED'
  order by created_at, id
  limit 1;

  if uncategorized_product_id is null then
    insert into public.lead_products (code, name, is_active)
    values ('UNCATEGORIZED', 'Uncategorized', true)
    returning id into uncategorized_product_id;
  else
    update public.lead_products
    set code = 'UNCATEGORIZED',
        name = 'Uncategorized',
        is_active = true
    where id = uncategorized_product_id;
  end if;
end;
$$;

-- The pool needs its own database key so it can be filtered and exposed to
-- Marketplace API keys without being mixed into normal Lead Master counts.
alter table public.leads
  drop constraint if exists leads_lead_database_check,
  add constraint leads_lead_database_check
    check (lead_database in (
      'leads',
      'reference_leads',
      'qualified_leads',
      'database_leads',
      'uncategorized_leads'
    ));

-- Uncategorized is deliberately not added to lead_database_priorities: it is
-- a holding pool for review, never a round-robin distribution queue.

-- Some older environments made the legacy product field optional. Keep it
-- optional at the table layer, while the trigger below always supplies the
-- Uncategorized product before the row is saved.
alter table public.leads
  alter column product_id drop not null;

create or replace function public.route_uncategorized_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uncategorized_product_id uuid;
begin
  if new.product_id is null then
    select id
      into uncategorized_product_id
    from public.lead_products
    where upper(btrim(code)) = 'UNCATEGORIZED'
      and is_active
    order by created_at, id
    limit 1;

    if uncategorized_product_id is null then
      raise exception 'The UNCATEGORIZED product must be active before a productless lead can be saved.';
    end if;

    new.product_id := uncategorized_product_id;
    new.stage_id := null;
    new.latest_resolution_id := null;
    new.lead_database := 'uncategorized_leads';
    return new;
  end if;

  if exists (
    select 1
    from public.lead_products product
    where product.id = new.product_id
      and upper(btrim(product.code)) = 'UNCATEGORIZED'
  ) then
    new.stage_id := null;
    new.latest_resolution_id := null;
    new.lead_database := 'uncategorized_leads';
  end if;

  return new;
end;
$$;

drop trigger if exists route_uncategorized_lead_on_insert_or_product_change on public.leads;
create trigger route_uncategorized_lead_on_insert_or_product_change
before insert or update of product_id on public.leads
for each row execute function public.route_uncategorized_lead();

-- Bring pre-existing productless records into the same product-backed pool.
update public.leads lead
set product_id = product.id,
    stage_id = null,
    latest_resolution_id = null,
    lead_database = 'uncategorized_leads',
    updated_at = now()
from public.lead_products product
where lead.product_id is null
  and upper(btrim(product.code)) = 'UNCATEGORIZED'
  and product.is_active;

-- Ensure already-created Uncategorized product records use the pool key too.
update public.leads lead
set lead_database = 'uncategorized_leads',
    updated_at = now()
from public.lead_products product
where product.id = lead.product_id
  and upper(btrim(product.code)) = 'UNCATEGORIZED'
  and lead.lead_database is distinct from 'uncategorized_leads';

-- Productless legacy records did not have product-assignment rows. Create one
-- so the normal table, detail panel, and manual-assignment actions can manage
-- them exactly like every other lead.
insert into public.lead_product_assignments (
  lead_id,
  product_id,
  stage_id,
  latest_resolution_id,
  assigned_to,
  assigned_at,
  next_follow_up_at,
  is_closed,
  created_by
)
select
  lead.id,
  lead.product_id,
  lead.stage_id,
  lead.latest_resolution_id,
  lead.assigned_to,
  lead.assigned_at,
  lead.next_follow_up_at,
  lead.is_closed,
  lead.created_by
from public.leads lead
join public.lead_products product
  on product.id = lead.product_id
 and upper(btrim(product.code)) = 'UNCATEGORIZED'
left join public.lead_product_assignments assignment
  on assignment.lead_id = lead.id
 and assignment.product_id = lead.product_id
where assignment.id is null;

create index if not exists leads_uncategorized_pool_idx
  on public.leads (created_at desc, id desc)
  where lead_database = 'uncategorized_leads';
