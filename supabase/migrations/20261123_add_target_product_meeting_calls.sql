alter table public.crm_targets add column if not exists meetings smallint not null default 3;
alter table public.crm_targets add column if not exists focused_calls smallint not null default 20;
alter table public.crm_targets add column if not exists product_targets jsonb not null default '{}'::jsonb;
