create table if not exists public.lead_round_robin_weekly_targets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.lead_products(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  target_count integer not null default 0 check (target_count between 0 and 100000),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id, day_of_week)
);

create index if not exists lead_round_robin_weekly_targets_product_idx
  on public.lead_round_robin_weekly_targets(product_id, day_of_week);

alter table public.lead_round_robin_weekly_targets enable row level security;

drop policy if exists "Admins manage lead round robin weekly targets" on public.lead_round_robin_weekly_targets;
create policy "Admins manage lead round robin weekly targets"
  on public.lead_round_robin_weekly_targets for all to authenticated
  using (public.has_role('admin')) with check (public.has_role('admin'));
