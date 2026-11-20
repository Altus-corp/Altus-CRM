-- Altus CRM v2 UI — ADDITIVE ONLY. Creates 4 new tables; changes nothing that exists.
-- Safe to run twice. Safe to roll back with the DROP block at the bottom.

-- 1) Which call resolution counts as Closing / Negotiation / Follow-up / Approach / Lost
create table if not exists public.crm_resolution_buckets (
  resolution_id uuid primary key references public.lead_resolutions(id) on delete cascade,
  bucket text not null check (bucket in ('closing','negotiation','followup','approach','new','lost')),
  updated_at timestamptz not null default now()
);

-- 2) Data-hygiene rules: which fields must be filled, from which stage bucket onward
create table if not exists public.crm_hygiene_rules (
  field_key text primary key,
  label text not null,
  from_bucket text not null default 'followup' check (from_bucket in ('approach','followup','negotiation','closing')),
  weight smallint not null default 1 check (weight between 1 and 3),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.crm_hygiene_rules (field_key, label)
select 'email', 'Email' where not exists (select 1 from public.crm_hygiene_rules where field_key = 'email');
insert into public.crm_hygiene_rules (field_key, label)
select c.field_key, c.label from public.lead_table_columns c
where c.source = 'custom' and not exists (select 1 from public.crm_hygiene_rules h where h.field_key = c.field_key)
order by c.position limit 12;

-- 3) Weekly targets per person (sales: demos, references, ambassadors, calls/day · ambassador: demos, leads)
create table if not exists public.crm_targets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  demos smallint not null default 3,
  references_per_week smallint not null default 15,
  ambassadors smallint not null default 3,
  calls_per_day smallint not null default 60,
  leads smallint not null default 10,
  updated_at timestamptz not null default now()
);

-- 4) AI insight cache (one row per role + product + period; refreshed every 2 h)
create table if not exists public.crm_ai_insight_cache (
  cache_key text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.crm_resolution_buckets enable row level security;
alter table public.crm_hygiene_rules enable row level security;
alter table public.crm_targets enable row level security;
alter table public.crm_ai_insight_cache enable row level security;

drop policy if exists "crm2 read buckets" on public.crm_resolution_buckets;
create policy "crm2 read buckets" on public.crm_resolution_buckets for select to authenticated using (true);
drop policy if exists "crm2 admin buckets" on public.crm_resolution_buckets;
create policy "crm2 admin buckets" on public.crm_resolution_buckets for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "crm2 read hygiene" on public.crm_hygiene_rules;
create policy "crm2 read hygiene" on public.crm_hygiene_rules for select to authenticated using (true);
drop policy if exists "crm2 admin hygiene" on public.crm_hygiene_rules;
create policy "crm2 admin hygiene" on public.crm_hygiene_rules for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));

drop policy if exists "crm2 read targets" on public.crm_targets;
create policy "crm2 read targets" on public.crm_targets for select to authenticated using (true);
drop policy if exists "crm2 admin targets" on public.crm_targets;
create policy "crm2 admin targets" on public.crm_targets for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
-- crm_ai_insight_cache: no policies on purpose → only the server (service role) reads/writes it.

-- ROLLBACK (only if you want to remove v2 completely):
-- drop table if exists public.crm_ai_insight_cache, public.crm_targets, public.crm_hygiene_rules, public.crm_resolution_buckets;
