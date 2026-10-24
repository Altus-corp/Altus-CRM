-- An activity type stays as text so new CRM activities can be added without a schema change.
alter table public.lead_activities
  add column if not exists activity_type text not null default 'note',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists lead_activities_lead_type_created_idx
  on public.lead_activities (lead_id, activity_type, created_at desc, id desc);
