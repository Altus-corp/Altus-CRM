# Quick Filter implementation plan

This is a Phase 1 plan only. Per `AGENTS.md` and `WORKFLOW.md`, implementation waits for owner approval and will proceed one phase at a time.

## Proposed data model

Add a numbered migration, likely `migrations/005_lead_quick_filters.sql`, with a per-user quick-filter table containing: id, owner user id, name, serialized validated condition/group definition (`jsonb`), optional current view/flat filters needed for compatibility, timestamps, and a uniqueness rule for names per user. Add indexes for owner and updated time. The exact shape will be finalized against the existing schema and migration conventions before implementation.

## Proposed API

Add authenticated, capability-gated routes in `server/index.cjs` (likely reusing `leads.view` for read/apply and `leads.edit` for create/update/delete unless the existing permission policy requires a separate capability):

- `GET /api/lead-quick-filters` — list the current user's filters.
- `POST /api/lead-quick-filters` — validate and create a filter.
- `PATCH /api/lead-quick-filters/:id` — validate and update an owned filter.
- `DELETE /api/lead-quick-filters/:id` — delete an owned filter.
- Extend `GET /api/leads` with a validated advanced-condition payload/reference so filtering remains server-side, parameterized, paginated, and counted consistently.

The condition compiler will use an allowlist mapping supported UI fields/operators to SQL expressions, preserve parameter binding, reject malformed or unsafe conditions, and define explicit semantics for AND/OR groups. It will not accept arbitrary SQL or arbitrary column names from the browser.

## Files expected to change/add

- `migrations/005_lead_quick_filters.sql` — persisted quick-filter schema and indexes.
- `server/index.cjs` — quick-filter CRUD handlers, ownership checks, condition validation/compiler, and Leads list integration.
- `src/screens/leads/function.tsx` — advanced-condition state, API calls, persisted filter loading, apply/edit/delete/clear behavior, pagination/query serialization, and toast state.
- `src/screens/leads/page.tsx` — advanced filter drawer, condition rows, AND/OR controls, save-name dialog, My Filters actions, active chip, and toast rendering.
- `src/screens/leads/leads.css` — drawer/dialog/menu/chip/toast styling using existing theme tokens.
- `tests/leads-api.test.cjs` or a new focused `tests/quick-filters-api.test.cjs` — CRUD, validation/authorization, server filtering, and pagination totals with synthetic fixtures.
- `tests/src-files.test.cjs` or a new focused UI/source test — structural regression checks where appropriate.
- `tests/quick-filters-e2e.test.cjs` — Playwright flow, after adding the smallest necessary Playwright test dependency/configuration consistent with project approval.
- `package.json` and `package-lock.json` — only if Playwright is approved/needed; no new UI framework or styling library is planned.

## UI/data flow

```text
+ Filter
  -> Advanced Filter drawer
  -> condition rows (field/operator/value)
  -> AND/OR group editing
  -> Apply / Show Results
  -> GET /api/leads with validated condition payload
  -> Save as Quick Filter
  -> POST /api/lead-quick-filters
  -> My Filters list (GET on screen load)
  -> apply | edit (PATCH) | delete (DELETE)
  -> active chip with clear action
```

## Test and proof plan

- Preserve and rerun the existing 51-test suite and production build.
- Add backend tests for create/list/update/delete, ownership/auth failures, malformed conditions, correct matching leads, and total counts across pages.
- Add a Playwright browser test covering create conditions, apply, save, reload persistence, apply, edit, delete, and active-chip clear.
- Start the app on the documented API/Vite URLs, run the browser test against synthetic/local fixtures only, and save step screenshots under `proof/screenshots`.
- Add `PROOF.md` only after implementation and verification, including actual command output, changed files, screenshot names, limitations, and run instructions.

## Risks

- SQL injection or accidental unrestricted field access if condition fields/operators are not strictly allowlisted.
- Existing flat filters, view predicates, search, counts, and pagination could diverge if advanced conditions are applied in a separate code path.
- User ownership and server authorization must not depend on hidden UI controls.
- Existing localStorage filters may need a compatibility decision so current users do not lose behavior unexpectedly.
- Playwright may require a new dependency/browser installation and could be unavailable in the current environment.
- Existing uncommitted Leads changes overlap the feature files and must be merged carefully rather than overwritten.

## Rollback

Before implementation, capture the current diff and database migration state. Roll back application changes by reverting only the feature files after approval; do not reset the worktree. If the migration is applied, use a reviewed compensating migration or restore a database backup rather than deleting production/customer data. Do not touch the old project or its port-5433 database.

## Approval gate

Do not implement until the owner approves this plan and the first implementation phase. The recommended first phase is the migration, backend validation/compiler, CRUD endpoints, and backend tests; then stop for review before UI/e2e work.
