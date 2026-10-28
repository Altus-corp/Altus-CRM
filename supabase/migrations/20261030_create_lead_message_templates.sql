create table if not exists public.lead_message_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.lead_products(id) on delete cascade,
  stage_id uuid references public.lead_stages(id) on delete set null,
  channel text not null check (channel in ('email', 'whatsapp')),
  name text not null,
  subject text,
  body text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_message_templates_product_channel_idx on public.lead_message_templates(product_id, channel);

-- Anyone signed in can read templates; creating, editing and deleting go through server actions.
alter table public.lead_message_templates enable row level security;
drop policy if exists "Signed in users read message templates" on public.lead_message_templates;
create policy "Signed in users read message templates" on public.lead_message_templates for select to authenticated using (true);
