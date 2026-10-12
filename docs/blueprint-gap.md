# Blueprint gap audit

Source: `docs/Altus_Single_Tenant_CRM_Blueprint.docx`.

Parsing method: VERIFIED — the DOCX was read by opening the ZIP package and extracting text from `word/document.xml` (`w:t` nodes). No database access was used.

The blueprint is a proposed architecture and implementation plan. “Built” below means the repository contains a working implementation surface, not merely a name in a migration or navigation item.

## 1. Status table

| Blueprint area | Status | Evidence in repository | Gap assessment |
|---|---|---|---|
| People and contacts | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`leads`); `migrations/004_accounts_contacts.sql` (`accounts`, `contacts`, `contact_leads`); `server/accounts.cjs`; `src/screens/accounts-contacts` | INFERRED — there is no single `persons` identity with separate phone, email, organization, source, and preference records as proposed by the blueprint. |
| Qualification: DL/L/QDL/QL/R | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`leads.lead_type`, `leads.priority`, `leads.stage`); `server/index.cjs` (`LEAD_TYPES`, lead creation/update); `tests/phase2-leads.test.cjs` | INFERRED — the repository maps lead types and priorities, but does not provide blueprint-style `qualification_records` or `qualification_history`. |
| References | VERIFIED — Deliberately different | VERIFIED — `server/index.cjs` (`LEAD_VIEWS.references`, lead stage `reference`); `src/screens/leads/function.tsx` (lead view); no reference relationship table in migrations | VERIFIED — the current project treats “References” as a lead filter/stage, while the blueprint defines referrer/referred-person relationships. |
| Assignment and round-robin | VERIFIED — Implemented for configured lead assignment | VERIFIED — `migrations/010_lead_round_robin.sql`; `server/lead-assignment.cjs`; `server/index.cjs`; `server/lead-import.cjs`; `server/admin.cjs`; `src/screens/leads`; `src/screens/admin` | INFERRED — queue-entry model, named-caller override, and broader assignment automation remain unimplemented. |
| Calling desk and resolutions | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`lead_calls`, `call_analytics_inputs`); `migrations/002_phase1_masters.sql` (resolution flags on `master_values`); `server/admin.cjs` (call history and analytics); `server/index.cjs` (lead detail calls) | INFERRED — calls are stored as lead child records; blueprint `call_sessions`, `call_resolutions`, and `call_outcomes` with a dedicated calling desk are not present. |
| Follow-up protection | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`lead_followups`); `server/index.cjs` (follow-up filters); `server/admin.cjs` (due and overdue follow-up queries); `migrations/002_phase1_masters.sql` (`workspace_settings` thresholds) | INFERRED — due/overdue visibility exists, but protected ownership, transfer authorization, and resolution-driven follow-up transactions are not implemented as blueprint entities/rules. |
| Product journeys | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`lead_products`, `lead_product_events`); `migrations/003_phase2_leads.sql`; `server/index.cjs` (lead product updates); `tests/phase2-leads.test.cjs` | INFERRED — product rows have lead-specific stage data, but there are no `products`, `journey_definitions`, `person_journeys`, or `journey_stage_history` tables. |
| Events and registrations | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`registration_records`); `migrations/002_phase1_masters.sql` (`registrations`); `server/index.cjs` (lead/registration-related views); `src/screens/quotes-invoicing` | INFERRED — registration-shaped legacy tables exist, but blueprint event schedules, event registrations, submissions, transfers, and reconfirmation tasks are not implemented. |
| Attendance | VERIFIED — Partly built | VERIFIED — `server/index.cjs` (attendance-related lead views); `migrations/001_phase0_foundation.sql` (`leads.custom_values`); `server/admin.cjs` (attendance metric query) | INFERRED — attendance is represented through lead stage/custom fields rather than a registration-linked `attendance_records` model. |
| Marketing | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`marketing_sequences`, `marketing_sequence_steps`, `message_log`); `migrations/002_phase1_masters.sql` (`admin_templates`); `src/screens/marketing`; `src/screens/workspace-data` | VERIFIED — the current Marketing screen is a lead-data workspace view. INFERRED — campaigns, segments, campaign members, delivery monitoring, consent, and real sequence execution are not implemented. |
| Sales and billing | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`leads.legacy_finance`, `payments`); `migrations/002_phase1_masters.sql` (`registrations`, `payments`); `src/screens/quotes-invoicing`; `server/index.cjs` (legacy lead finance/product handling) | INFERRED — normalized sales, sale items, payment obligations, allocations, adjustments, invoices, and immutable issued-document rules are absent. |
| Automation | VERIFIED — Partly built | VERIFIED — lead round-robin assignment has transactional rule matching, rotation state, and history; no general automation worker/run/scheduled-job implementation exists | INFERRED — the existing sequence tables are storage placeholders, not the blueprint’s general trigger, retry, idempotency, and execution-log engine. |
| Audit logs | VERIFIED — Partly built | VERIFIED — `migrations/002_phase1_masters.sql` (`audit_log`); `server/audit.cjs`; `server/index.cjs` and `server/accounts.cjs` call the audit writer; `server/admin.cjs` exposes an audit screen | INFERRED — coverage is application-action based and the admin audit screen reads `lead_history`; blueprint-wide append-only governance, before/after data, retention, exports, and automation audit coverage are incomplete. |
| Users, roles, and offboarding | VERIFIED — Partly built | VERIFIED — `migrations/001_phase0_foundation.sql` (`users`, `credentials`, `sessions`); `migrations/002_phase1_masters.sql` (`employee_profiles`, `user_targets`); `server/index.cjs` user/employee/offboarding handlers; `server/permissions.cjs`; `src/shared/auth/permissions.ts`; `tests/users-api.test.cjs` | VERIFIED — user management, role checks, sessions, targets, and offboarding exist. INFERRED — the blueprint’s separate roles/permissions/user-role/schedule model and broader workforce rules are not present. |
| Reports | VERIFIED — Partly built | VERIFIED — `server/admin.cjs` (dashboard, call-history, analytics, reports); `src/screens/reports`; `src/screens/workspace-data`; `migrations/002_phase1_masters.sql` (`user_targets`) | VERIFIED — current reports use selected lead/call aggregates and placeholder lead views. INFERRED — blueprint metrics across journeys, events, campaigns, sales, collections, assignment, and reconfirmation are not yet backed by dedicated source records. |

## 2. Five costly gaps

1. **[INFERRED] Establish the master person identity and deduplication boundary.** Most blueprint modules reference a person. Adding it after accounts, contacts, lead children, registrations, journeys, and payments exist would require foreign-key migration, duplicate matching, history preservation, and reconciliation across multiple identifiers.

2. **[INFERRED] Add independent product journeys and stage history.** The current `lead_products` records are attached to leads. Retrofitting independent journeys later would require separating product state from lead state without overwriting existing stage, call, event, and finance history.

3. **[INFERRED] Add the event, registration, reconfirmation, and attendance model.** Event reminders, duplicate submissions, transfers, cancellations, and post-event journeys depend on stable registration identity and idempotency. Building this after messaging or sales flows would create migration and replay risks.

4. **[INFERRED] Add a unified activity/calling/follow-up model with ownership protection.** Existing `lead_calls` and `lead_followups` are useful source records, but the blueprint requires transactional call outcomes, protected follow-ups, transfer rules, and a timeline. Delaying this makes later assignment and reporting integrations more expensive.

5. **[INFERRED] Normalize sales, obligations, payments, and allocations before expanding finance.** `leads.legacy_finance` and lead-linked `payments` do not establish the blueprint’s sale/payment-obligation/payment-allocation boundaries. Retrofitting balances, reversals, duplicate references, and financial reports later would require careful historical mapping.

## 3. Possible person identity

### `leads`

- **[VERIFIED]** `leads` already contains name, phones, email, organization/company, source fields, owner, stage, product-adjacent fields, timestamps, and legacy data.
- **[INFERRED]** It is the strongest migration starting point because the existing child tables already reference `lead_id`.
- **[INFERRED]** It should be split or renamed into a master person boundary, with separate phone/email tables, organizations, sources, contact preferences, qualification records, and explicit product journeys. Existing call, follow-up, history, message, product, registration, payment, and account/contact links would need a deliberate migration strategy.

### `contacts`

- **[VERIFIED]** `contacts` has person-like fields and `contact_leads`, but also has `account_id` and archive status.
- **[INFERRED]** It could become a normalized contact-detail layer under a future person table, but using it directly as the master identity would require removing its current account-contact role, adding source and deduplication semantics, and migrating lead identity relationships.

### `accounts`

- **[VERIFIED]** `accounts` stores organization-like fields and is linked from `contacts`.
- **[INFERRED]** It should remain an organization/company entity, not become the person identity.

### `users`

- **[VERIFIED]** `users` is referenced by credentials, sessions, ownership, employee profiles, and audit records.
- **[INFERRED]** It is workforce identity and must remain separate from customer/person identity.

## 4. Recommended module order

The user plan is Tasks & Activity → Quote & Invoicing → Reports → Marketing. The blueprint phases are foundation → core CRM → assignment/calling → products/marketing → events/conversion → sales/billing → admin/automation/hardening.

| Recommended order | Module or foundation | Relation to the user plan and blueprint |
|---|---|---|
| 1 | **Person/source/duplicate foundation and qualification** | INFERRED — add before the user plan. This is blueprint Phase 1–2 and is the dependency for every person-linked module. Preserve the current lead identity during migration. |
| 2 | **Accounts & Contacts consolidation** | VERIFIED — the repository has this module; INFERRED — connect it to the eventual person/organization boundary before adding more dependent records. |
| 3 | **Tasks & Activity, assignment, calling, and follow-up protection** | INFERRED — this is the user plan’s first module and blueprint Phase 3. It should include the unified timeline, queues, resolutions, protected follow-ups, and transfer rules rather than only another lead view. |
| 4 | **Products, journeys, and references** | INFERRED — blueprint Phase 4 requires these before event and sales conversion. This is missing from the user plan and should be inserted before Marketing is made operational. |
| 5 | **Marketing** | INFERRED — the user plan places Marketing last, but the blueprint places it with products in Phase 4. Build campaign/templates/consent foundations after person and journey identity, before event reminders and attribution. |
| 6 | **Events, registrations, reconfirmation, and attendance** | INFERRED — blueprint Phase 5; missing from the user plan. This should precede finance because event-to-sale reporting depends on stable registration and attendance records. |
| 7 | **Quote & Invoicing / Sales & Billing** | INFERRED — the user plan’s second module maps to blueprint Phase 6. Build normalized sales, obligations, payments, allocations, balances, and collection follow-ups after product/event identities exist. |
| 8 | **Reports** | INFERRED — the user plan’s third module should be treated as cross-cutting. Define report contracts early, but implement broad reports after their source modules exist; otherwise reports will remain lead-derived placeholders. |
| 9 | **Automation, admin configuration, audit governance, and hardening** | INFERRED — blueprint Phase 7. Finish with retries, idempotency, execution logs, configuration, backup/restore, and complete audit coverage. |

## Verified versus inferred

- **VERIFIED:** DOCX parsing succeeded through `word/document.xml` extraction.
- **VERIFIED:** repository evidence cited above was read from source, migrations, server modules, screens, scripts, and tests.
- **VERIFIED:** no database access was performed.
- **INFERRED:** gap severity, future schema migration effort, identity selection, and recommended module order are architectural recommendations rather than current repository facts.

