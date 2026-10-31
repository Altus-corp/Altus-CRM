-- A Channel Partner is a share of a lead, not a replacement for its Sales Person.
-- New shares are focused for the selected Ambassador today and naturally move
-- to their Lead Master tomorrow.
alter table public.leads add column if not exists channel_partner_ids uuid[] not null default '{}';

create table if not exists public.lead_channel_partners (
  lead_id uuid not null references public.leads(id) on delete cascade,
  ambassador_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  focused_on date,
  primary key (lead_id, ambassador_id)
);

create index if not exists lead_channel_partners_ambassador_focus_idx
  on public.lead_channel_partners(ambassador_id, focused_on, assigned_at desc);

-- Preserve selections saved by the first Channel Partner release.
insert into public.lead_channel_partners (lead_id, ambassador_id, assigned_by, assigned_at)
select lead.id, partner_id, lead.created_by, lead.created_at
from public.leads lead
cross join lateral unnest(coalesce(lead.channel_partner_ids, '{}'::uuid[])) as partner_id
on conflict (lead_id, ambassador_id) do nothing;

alter table public.lead_channel_partners enable row level security;

drop policy if exists "Admins manage lead channel partners" on public.lead_channel_partners;
create policy "Admins manage lead channel partners" on public.lead_channel_partners
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists "Ambassadors read their shared leads" on public.lead_channel_partners;
create policy "Ambassadors read their shared leads" on public.lead_channel_partners
  for select to authenticated
  using (ambassador_id = (select auth.uid()));

drop policy if exists "Users read assigned product leads or admins read all" on public.leads;
drop policy if exists "Users read assigned product leads or shared channel leads" on public.leads;
create policy "Users read assigned product leads or shared channel leads" on public.leads
  for select to authenticated using (
    public.has_role('admin')
    or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.lead_id = leads.id
        and assignment.assigned_to = (select auth.uid())
        and assignment.is_active
    )
    or exists (
      select 1 from public.lead_channel_partners partner
      where partner.lead_id = leads.id
        and partner.ambassador_id = (select auth.uid())
    )
  );

drop policy if exists "Users read their lead product assignments" on public.lead_product_assignments;
create policy "Users read their lead product assignments" on public.lead_product_assignments
  for select to authenticated using (
    assigned_to = (select auth.uid())
    or exists (
      select 1 from public.lead_channel_partners partner
      where partner.lead_id = lead_product_assignments.lead_id
        and partner.ambassador_id = (select auth.uid())
    )
  );

drop policy if exists "Users read activities for accessible product assignments" on public.lead_activities;
create policy "Users read activities for accessible product assignments" on public.lead_activities
  for select to authenticated using (
    public.has_role('admin')
    or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.id = lead_activities.lead_product_assignment_id
        and assignment.assigned_to = (select auth.uid())
        and assignment.is_active
    )
    or exists (
      select 1 from public.lead_channel_partners partner
      where partner.lead_id = lead_activities.lead_id
        and partner.ambassador_id = (select auth.uid())
    )
  );
