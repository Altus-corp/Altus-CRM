-- First-page Lead Master and product-workspace queries.
create index if not exists leads_created_at_desc_idx
  on public.leads (created_at desc, id desc);

create index if not exists lead_product_assignments_owner_product_open_idx
  on public.lead_product_assignments (assigned_to, product_id, assigned_at desc, id desc)
  where is_active and not is_closed;
