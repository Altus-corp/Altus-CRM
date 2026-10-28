-- A product assignment can be owned long-term in Lead Master and focused for one
-- specific working day. This lets a daily round-robin run be safely repeated.
alter table public.lead_product_assignments
  add column if not exists focused_on date,
  add column if not exists assignment_origin text not null default 'manual';

alter table public.lead_product_assignments
  drop constraint if exists lead_product_assignments_assignment_origin_check;

alter table public.lead_product_assignments
  add constraint lead_product_assignments_assignment_origin_check
  check (assignment_origin in ('manual', 'round_robin', 'released', 'import'));

create index if not exists lead_product_assignments_focus_idx
  on public.lead_product_assignments (assigned_to, focused_on, product_id)
  where is_active and not is_closed;

create index if not exists lead_product_assignments_unassigned_pool_idx
  on public.lead_product_assignments (product_id, created_at, id)
  where assigned_to is null and is_active and not is_closed;
