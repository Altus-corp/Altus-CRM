# Altus CRM v2

A Next.js + Supabase CRM for Altus Corp's sales, ambassador, and marketing teams — lead management, round-robin assignment, Ambassador program, call/meeting integrations, and an admin AI assistant.

See **[DOCUMENTATION.md](./DOCUMENTATION.md)** for architecture and conventions, and **[HANDOFF.md](./HANDOFF.md)** for current status and what's left to do.

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19
- **Database/Auth:** Supabase (Postgres, Auth, Storage)
- **Styling:** Tailwind CSS 4
- **Hosting:** self-managed (not Vercel) — `npm run build` / `npm run start`

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Logging in redirects to `/dashboard` (the classic UI). A second, newer UI lives at `/crm` — see below.

### Environment variables

Copy `.env.example` (if present) or ask an existing team member for `.env`. At minimum you need the Supabase keys (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) to run the app at all. Everything else (SMTP, Zoom, Google Calendar, WMS attendance, AltusCorp/Mananvasa/PSO/BSSO sync, the AI assistant, CDN uploads) is optional — the feature it powers simply won't work without it, but the rest of the app still runs. The full list is documented in **DOCUMENTATION.md**.

### Database migrations

Migrations live in `supabase/migrations/` and are run manually in the Supabase SQL Editor (there is no CI migration runner here) — run new ones in filename order whenever you pull changes. Check `HANDOFF.md` for which ones are still pending in the live database as of the last handoff.

## Two UI systems in this repo

| | `/dashboard` | `/crm` |
|---|---|---|
| Status | Classic, current production UI | Newer UI, built on top of the same backend |
| Backend | Same Supabase tables, same server actions | Same Supabase tables, same server actions (read-only loader + the existing write actions) |
| Use | What every user signs into today | Opt-in preview — not yet the default |

Both read and write through the **same** server actions in `app/dashboard/leads/actions.ts` and related files — `/crm` does not duplicate business logic, only presentation. See DOCUMENTATION.md for the architecture split.

## Project structure (high level)

```
app/
  dashboard/        Classic UI (routes, actions, components per feature area)
  crm/               Newer UI at /crm (routes + actions; reads via app/lib/crm2/workspace.ts)
  api/               Route handlers: cron jobs, webhooks, admin endpoints, proxies
  lib/               Shared server-side logic (auth, email, integrations, AI assistant, etc.)
  login/, change-password/, reset-password/   Auth flow pages
components/
  leads/, ambassadors/, admin/, auth/         Client components grouped by feature
supabase/
  migrations/        SQL migrations, run manually, in filename order
```
