-- Confirmation details captured while a lead's PSO work is in the "Pre PSO" stage.
-- One row per product assignment. Rows are written server-side (service role) after the
-- action checks the caller owns the assignment, so only a read policy is needed.
create table if not exists public.lead_pre_pso_details (
  assignment_id uuid primary key references public.lead_product_assignments(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  confirmation_done_by text,
  confirmation_call_resolution_id uuid references public.lead_resolutions(id) on delete set null,
  confirmation_notes text,
  meeting_link_sent boolean,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_pre_pso_details_lead_idx on public.lead_pre_pso_details (lead_id);

alter table public.lead_pre_pso_details enable row level security;

create policy "Users read Pre PSO details for their assignments or admins read all"
  on public.lead_pre_pso_details for select to authenticated
  using (
    public.has_role('admin') or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.id = lead_pre_pso_details.assignment_id
        and assignment.assigned_to = (select auth.uid()) and assignment.is_active
    )
  );
