-- Targets are set by an administrator. Actuals are updated only by the
-- assigned Sales Executive or Sales Manager from their Ambassador workspace.
alter table public.lead_product_assignments
  add column if not exists ambassador_actual_leads integer,
  add column if not exists ambassador_actual_demo integer,
  add column if not exists ambassador_actual_proposals integer,
  add column if not exists ambassador_actual_sales integer;

alter table public.lead_product_assignments
  drop constraint if exists lead_product_assignments_ambassador_actual_targets_check,
  add constraint lead_product_assignments_ambassador_actual_targets_check
    check (
      (ambassador_actual_leads is null or ambassador_actual_leads >= 0)
      and (ambassador_actual_demo is null or ambassador_actual_demo >= 0)
      and (ambassador_actual_proposals is null or ambassador_actual_proposals >= 0)
      and (ambassador_actual_sales is null or ambassador_actual_sales >= 0)
    );
