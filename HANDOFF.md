# Handoff notes — Altus CRM v2

Status snapshot as of **20 Nov 2026**. Read `README.md` for setup and `DOCUMENTATION.md` for architecture.

## Working and confirmed in use

- Core lead engine: products, stages, resolutions, custom fields, bulk import/export, round-robin, Ambassador program (CRM records + login accounts, both manual and bulk, for sales roles and admin).
- Google Meet / Zoom scheduling with multi-attendee invites; Zoom recording-link webhook.
- Admin "Ask the CRM" AI assistant, currently configured with **Groq** (`AI_PROVIDER=groq`) — confirmed answering real questions (overdue follow-ups, calls today, sales person leads, etc.) in this environment.
- Voice dictation on Lead Detail free-text fields.
- "Add to Google Calendar" link on follow-up activities (no OAuth, just a prefilled Google Calendar URL).
- Ringing-streak (5x) and stall-streak (10x: No Busy / Call Back / Call for Next combined) auto-release to the unassigned pool — depends on the `ResolutionPicker` component, not a native `<select>` (see DOCUMENTATION.md §6 for why).

## Needs verification before relying on it

Run each of these migrations in the Supabase SQL Editor if not already applied, and confirm the matching feature actually works afterward — several of the items above hit "column does not exist" errors mid-session until their migration was run:

- `20261118_add_ringing_streak.sql`
- `20261118_add_password_changed_at.sql`
- `20261118_add_meeting_recording_urls.sql`
- `20261119_add_stall_streak.sql`
- `20261119_add_geo_fence_assignments.sql` — **built but not yet confirmed tested end-to-end.** Go to `/dashboard/geo-settings`, assign a geofence to a test user, and confirm login is actually blocked outside the radius before relying on it for anyone real.
- `20261117_crm_v2_ui.sql` — **not yet run.** Required before `/crm` will show real data (additive-only, safe to run; see DOCUMENTATION.md §9).

## Built but not finished / not default

- **`/crm` (v2 UI)** — all 24 files from the implementation pack are in the repo and typecheck/lint clean, but:
  - The migration above hasn't been run, so dashboards will currently load with empty/default data.
  - It is **not** the UI users land on after login — `/dashboard` still is. Making `/crm` the default is a deliberate, separate step (set `CRM_DEFAULT_UI=v2` and flip the redirect in `app/login/actions.ts` — intentionally not done automatically).
  - Has not been visually reviewed against the original wireframe/prototype (those Claude.ai artifact links were never made accessible to this session) — only checked against the written decisions doc and config values.
  - `ANTHROPIC_API_KEY` is not set, so its "AI Insights" dashboard will use the built-in rule-engine fallback, not real Claude output, until that key is added.

## Known gaps (deliberately not built, or blocked by a third party)

- **No holiday calendar.** The WMS attendance API (used to gate round-robin) only reports present/absent per person — it cannot distinguish "it's a company holiday" from "everyone forgot to punch in." If this matters, it needs either a holiday-calendar endpoint from WMS's maintainer, or a simple admin-managed holiday list built directly in the CRM (not built; flagged, not requested further).
- **Gemini is configured but has been unreliable in this environment** — hit "free tier not available for this project" (account/project-level Google restriction, not fixable from code), then a deprecated model name, then a role-naming API change, then transient overload errors. The code has retry logic and env-overridable model names to absorb future API drift, but Groq is the provider actually in use today because of this history.
- **No "restore from export" feature** — the admin "Export all data" button is a one-way safety snapshot only.
- **Password-change session kill is next-request, not instant** — a changed password invalidates the old session the next time that browser makes a request, not immediately/in real time.
- **Ambassador → Sales Person cascade reassignment** was discussed once and explicitly deferred by the user ("let it be first, I will check then let you know") — never resumed.

## Where to look first if something breaks

- Slow pages → check `app/lib/auth.ts` `requireUser()` hasn't regressed back to sequential awaits.
- A custom field "disappearing" or not matching → check the code resolves it by label (DOCUMENTATION.md §4), not a hardcoded key.
- A resync silently wiping sales team data → check the sync merges `custom_data` instead of replacing it wholesale.
- Bulk import rejecting a visually-correct email/value → likely an Excel hyperlink-cell object, not a plain string; check for a `cellText()`-style unwrap helper.
