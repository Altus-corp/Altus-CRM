-- Permanent record of calls a CRM user made to / received from CRM leads.
-- Rows are written server-side (service role) only for calls whose number matches a lead the
-- user owns or previously owned, so personal calls are never stored. The row keeps its own
-- snapshot of the lead name, so the caller's history survives the lead being reassigned.
create table if not exists public.lead_call_log (
  id uuid primary key default gen_random_uuid(),
  altus_call_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  lead_product_assignment_id uuid references public.lead_product_assignments(id) on delete set null,
  lead_name text not null,
  lead_company text,
  phone text,
  direction text not null check (direction in ('incoming', 'outgoing')),
  is_connected boolean not null default false,
  duration_seconds integer,
  called_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists lead_call_log_user_called_idx
  on public.lead_call_log (user_id, called_at desc);

alter table public.lead_call_log enable row level security;

-- No insert/update/delete policies: only the server (service role) writes this table.
create policy "Users read their own lead call log or admins read all"
  on public.lead_call_log for select to authenticated
  using (user_id = (select auth.uid()) or public.has_role('admin'));
