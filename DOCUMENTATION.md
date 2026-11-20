# Altus CRM v2 — Documentation

Architecture, data model, and conventions. For current status and pending work, see `HANDOFF.md`.

## 1. Core data model

- **`leads`** — one row per contact. `custom_data` (jsonb) holds admin-defined fields, keyed by a `field_key` that's a slugified label plus a random suffix (e.g. `pan_number_a1b2c3`). **Never hardcode a custom field's key** — always resolve it by label via the `lead_table_columns` table (see §4).
- **`lead_product_assignments`** — the real unit of work. A lead can have multiple rows here (one per product: PSO, BSSO, AMBASSADOR, RETAINER, KEYNOTE, PS, ALTUS OS, etc.), each with its own `stage_id`, `latest_resolution_id`, `assigned_to`, `is_active`/`is_closed`, and counters like `ringing_streak`, `stall_streak`, `focused_on`.
- **`lead_resolutions`** / **`lead_stages`** / **`lead_products`** — configurable per-product pipelines, edited by admins in Lead Configuration.
- **`lead_activities`** — append-only audit trail (resolution changes, notes, calls, emails, follow-ups, releases to the unassigned pool). `metadata` jsonb carries structured extras (e.g. `attachments` for file/calendar links, rendered generically by the Activity tab).
- **Ambassador program** reuses the same `lead_product_assignments` table with `is_ambassador = true` and a dedicated workflow helper, `resolveAmbassadorWorkflowPatch()` (in `app/dashboard/my-ambassador/actions.ts`), applied uniformly across create/update/sync/document-upload so Pre Sales ↔ Onboarding Ambassador routing never drifts between entry points.

## 2. Auth

- `app/lib/auth.ts` → `requireUser()` is the single entry point every dashboard page/action calls. It batches the auth/profile/role lookups into one `Promise.all` (this was previously sequential and was the #1 cause of slow page loads — don't revert it to sequential awaits).
- `requireAdmin()` wraps it and redirects non-admins.
- Session invalidation on password change: `profiles.password_changed_at` is compared against the session JWT's `iat` claim on every request; if the password changed after the session was issued, the user is signed out.
- **Login geofencing** (optional, opt-in per user): `app/dashboard/geo-settings/` lets an admin restrict a specific user's login to a radius around a lat/lng. Enforced client-side (browser Geolocation API, requested at submit time in `app/login/login-form.tsx`) and server-side (`app/login/actions.ts`, haversine check in `app/lib/geo-fence.ts`). Users with no geofence row are unrestricted.

## 3. Supabase client usage

Two clients are used throughout, and mixing them up is a common source of bugs:

- **`createClient()`** (`app/lib/supabase/server.ts`) — respects RLS, scoped to the logged-in user's session.
- **`createAdminClient()`** (`app/lib/supabase/admin.ts`) — service role, bypasses RLS. Used after an explicit permission check in code (e.g. `requireAdmin()` or a role check), or when a write's correctness doesn't depend on RLS (bulk imports, cron syncs, cross-user lookups like resolving a sales person's name).

One concrete gotcha already hit in this codebase: an `INSERT ... RETURNING` under the RLS client can fail with "new row violates row-level security policy" if the SELECT policy depends on a side effect (like an `AFTER INSERT` trigger) that isn't guaranteed visible yet in the same statement. When a write's authorization is already fully checked in code, prefer the admin client over fighting that ordering.

## 4. Custom fields — label-based key resolution

Admins add custom columns via Lead Configuration (`app/dashboard/lead-settings/`), which generates `field_key = slugify(label) + "_" + random6hex`. Because of the random suffix, **no server action may assume a fixed key** for an admin-created field. The established pattern, repeated everywhere a sync or action needs a specific custom column:

```ts
const fieldKeyFor = (label: string) =>
  (customColumns ?? []).find((c) => normalize(c.label) === normalize(label))?.field_key ?? null;
```

This is why KYC fields, "Ambassador Import Summary", "Form Message", etc. are all looked up by label, not by a constant.

## 5. Role-based access pattern

Reused across leads, ambassadors, documents, and workflow actions:

```ts
if (!user.roles.includes("admin")) {
  if (user.roles.includes("sales_manager")) {
    // allowed only for own team, via getSalesManagerTeamMemberIds()
  } else if (assignment.assigned_to !== user.userId) {
    throw new Error("not allowed");
  }
}
```
Admin bypasses everything; sales managers get their team via `app/lib/sales-manager-team.ts`; everyone else is scoped to their own assignments.

## 6. Streak-based auto-release rules

Two independent counters on `lead_product_assignments`, both reset to 0 the moment a different resolution is picked:

- **`ringing_streak`** — 5 consecutive "Ringing" resolutions releases the lead to the unassigned pool.
- **`stall_streak`** — 10 consecutive resolutions from the combined group {"No Busy", "Call Back", "Call for Next"} does the same.

Both live in `updateLeadResolutionInline()` in `app/dashboard/leads/actions.ts`. **Important UI constraint:** the Activity Resolution picker must never be a native `<select>` — browsers don't fire a `change` event when the user re-selects the value already shown, which silently breaks both streak rules on repeat identical picks. Use `components/leads/resolution-picker.tsx` (a button + menu) everywhere resolution is set.

## 7. External integrations

| Integration | Files | Notes |
|---|---|---|
| Google Calendar / Meet | `app/lib/google-calendar.ts` | Creates Meet spaces via the Meet API (not Calendar's auto-conferenceData) with `accessType: OPEN` and `autoRecordingGeneration: "ON"`, so external (non-Workspace) participants join directly and the call attempts to auto-record. Recording links are polled back via `app/lib/google-meet-recordings.ts` + a cron route, since Google doesn't push them. |
| Zoom | `app/lib/zoom.ts` | Server-to-server OAuth. Meetings request `auto_recording: "cloud"`; the actual recording link arrives via webhook (`app/api/webhooks/zoom/route.ts`), verified with `ZOOM_WEBHOOK_SECRET_TOKEN`. |
| "Add to Google Calendar" on follow-ups | `app/lib/google-calendar-link.ts` | Deliberately **not** the OAuth flow above — this just builds a `calendar.google.com/render` URL so any user can add a follow-up to their *own* personal Google Calendar with one click. No credentials involved. |
| WMS attendance | `app/lib/wms-attendance.ts` | External attendance API used to gate round-robin lead assignment to people who are actually punched in. It only returns `"present"`/`"absent"` — it has no holiday concept, so a company holiday looks identical to "everyone forgot to punch in." |
| Altus Contacts (call logs/transcripts) | referenced from `app/dashboard/leads/actions.ts`, `app/lib/lead-call-log.ts` | Call history sync and transcript matching by phone number. |
| Lead source syncs (AltusCorp, Mananvasa, Productivity Shastra, PSO/BSSO Google Sheets) | `app/api/cron/lead-source-sync/route.ts` | Runs all sources in parallel (`Promise.allSettled`) — this was previously sequential and could exceed the external scheduler's timeout. Each sync must **merge** into `custom_data`, never overwrite it wholesale — sales teams work the record between syncs. |
| Voice dictation | `components/leads/voice-dictation-button.tsx` | Browser's built-in Web Speech API. No server cost, but can't truly auto-detect language — the user picks one from a small dropdown (English/Hindi/Marathi/Gujarati/Bengali), remembered via `localStorage`. |

## 8. Admin AI assistant ("Ask the CRM")

Admin-only, read-only chat widget (`components/admin/crm-assistant.tsx`), wired into `app/dashboard/layout.tsx`.

- **Provider-swappable by design**: `app/lib/ai/types.ts` defines a generic `ChatProvider` interface; `app/lib/ai/providers/index.ts` is a factory reading `AI_PROVIDER` from env (`"gemini"` or `"groq"` today). Adding another provider means one new file + one switch case — nothing else changes.
- **Tools, not raw SQL**: `app/lib/ai/tools.ts` defines a fixed set of safe, read-only lookups (overdue follow-ups, leads by resolution/sales person, stuck Ringing/stall leads, today's calls, sales person performance). The model can only call these — it can never run arbitrary SQL or write data.
- **Agent loop**: `app/lib/ai/run-assistant.ts`, capped at 5 tool-call rounds per question.
- Both free-tier providers (Gemini, Groq) have changed model names / API shapes more than once during development — if a provider throws a "model not found" or "role not supported" error, check that provider's current docs before assuming the code is wrong; both `GEMINI_MODEL` and `GROQ_MODEL` are env-overridable for exactly this reason.

## 9. The `/crm` (v2) UI

A parallel UI at `app/crm/`, built from a static implementation pack, additive only:

- `app/lib/crm2/workspace.ts` — a **read-only** server loader that turns existing Supabase tables into one `Workspace` payload (role-scoped, PII-hidden for marketing-only roles).
- `app/lib/crm2/metrics.ts` — all dashboard math (ageing, targets, ranking, hygiene, funnel, etc.) computed client/server from that payload.
- `app/crm/actions.ts` — thin wrappers that call the **same** existing server actions in `app/dashboard/leads/actions.ts` (`updateLeadResolutionInline`, `updateLeadFollowUp`, etc.) plus new saves for its own config tables (targets, hygiene rules, resolution→bucket mapping).
- `components/crm2/*` — the UI itself: module bar, title bar, dashboards, the DataTable (grouping, views, exports), lead detail window.
- New tables (`supabase/migrations/20261117_crm_v2_ui.sql`, additive-only, see `HANDOFF.md` for whether it's been run yet): `crm_resolution_buckets`, `crm_hygiene_rules`, `crm_targets`, `crm_ai_insight_cache`.
- **Not wired as the default** — users land on `/dashboard` after login unless `CRM_DEFAULT_UI=v2` is set (that env var does not exist in this environment yet; see HANDOFF.md).

## 10. Conventions worth knowing before editing

- `export const instant = false;` on dashboard pages, `await connection()` where used, `params` as a `Promise` — these are this Next.js version's conventions (see `AGENTS.md`), not something to "modernize" away.
- Bulk-import flows (leads, Ambassadors, Ambassador accounts) all follow the same shape: download an Excel template (dropdown-validated, via `exceljs`) → upload → parse client-side with a `cellText()` helper that unwraps Excel's hyperlink-cell objects (plain `String(cell.value)` on a hyperlinked cell produces `"[object Object]"`, a bug hit more than once) → call a server action that processes rows and reports per-row skips/errors without auto-closing the result modal.
- Git commits in this repo are pushed with `git push origin main` directly (no PR flow observed in this history); GitHub's branch protection bypass message on push is expected, not an error.
