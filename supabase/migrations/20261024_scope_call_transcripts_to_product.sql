-- A call belongs to the contact, but its CRM follow-up can be attached to one
-- product assignment. Multi-product leads start unassigned until selected.
alter table public.lead_call_transcripts
  add column if not exists lead_product_assignment_id uuid references public.lead_product_assignments(id) on delete set null;

create index if not exists lead_call_transcripts_assignment_idx
  on public.lead_call_transcripts(lead_product_assignment_id, updated_at desc);

-- Existing transcripts came from the lead's original product assignment.
update public.lead_call_transcripts transcript
set lead_product_assignment_id = assignment.id
from public.lead_product_assignments assignment
where assignment.lead_id = transcript.lead_id
  and transcript.lead_product_assignment_id is null
  and assignment.product_id = (select product_id from public.leads where id = transcript.lead_id);

drop policy if exists "Users read accessible lead call transcripts" on public.lead_call_transcripts;
create policy "Users read accessible product call transcripts"
  on public.lead_call_transcripts for select to authenticated
  using (
    public.has_role('admin') or exists (
      select 1 from public.lead_product_assignments assignment
      where assignment.lead_id = lead_call_transcripts.lead_id
        and assignment.assigned_to = (select auth.uid())
        and assignment.is_active
    )
  );
