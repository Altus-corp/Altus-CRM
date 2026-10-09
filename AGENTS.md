# Agent instructions for Altus CRM

## Scope

This repository is a single-tenant CRM for one company. It uses React, TypeScript, Vite, React Router, a client-side rendered UI, a Node server in `server/`, and PostgreSQL development database `crm_dev` on port `5435`.

The old project at `A:\office\Workflow\Altus-CRM` and its live database on port `5433` are read-only references. Never touch them.

## Required session procedure

At session start:

1. Check `git status`.
2. Check `git log -3`.
3. Confirm required files exist.
4. Run `npm test`.
5. Run `npm run build`.

Run the repository as-is before making changes. Read `README.md`, `WORKFLOW.md`, `AGENTS.md`, `docs/conventions.md`, environment templates, and relevant history before architectural work.

Plan before implementation. The plan must name files, endpoints, data model changes, tests, risks, and rollback. Wait for approval, implement one phase only, then stop and report.

## Source and UI rules

- The current branch is authoritative; never replace it with older material.
- Keep the UI client-side rendered. Do not add SSR, hydration, Next.js, Tailwind, or a UI library without approval.
- Use `src/screens/<name>/page.tsx` for rendering and `function.tsx` for screen state/API logic.
- Use `src/shared/` for shared API, auth, layout, and theme code.
- Use tokens from `src/shared/theme/tokens.css`; do not introduce unrelated hard-coded colors.
- Keep Leads, Marketing, Reports, Quote & Invoicing, Accounts & Contacts, and Tasks & Activity available to every role.
- Show admin groups only through the `nav.admin` capability. Old stages are Leads filters/tabs.
- Do not alter unrelated screens.

## Data, security, and privacy

- Never print or commit `.env`, `.env.*`, `login.txt`, passwords, keys, hashes, connection strings, or customer values.
- `.env.example` contains variable names only and must never contain secrets.
- Set environment variables per process.
- Keep real customer data in the local development database. Logs, tests, fixtures, docs, and screenshots may contain counts or synthetic values only.
- Preserve scrypt password hashing, hashed session tokens, HttpOnly SameSite cookies, the `x-altus` header on POSTs, throttling, security headers, and server-side authorization.
- Hidden UI is not authorization. Keep client and server role maps mirrored.

## Database and imports

- Use numbered migrations through `scripts/migrate.cjs`.
- The expected project database target is local `crm_dev` on port `5435`.
- Imports use `dry-run`, `apply`, and `verify` modes and are idempotent by source ID.
- Do not run the live verifier implicitly: `tests/verify-leads-live.cjs` is separate from `npm test` and can touch the database.
- Do not use the old database or old project as a writable source.

## Git and change control

- Commit only when the owner asks.
- Never use `git reset --hard`, `git clean -fd`, or force-push.
- Back up before deleting anything large.
- Report every changed file, verification result, manual checklist, known limitation, and rollback plan.
- Do not weaken tests to make them pass.

## Known repository gaps

- No npm scripts exist for migration, owner seeding, user management, import, dump, restore, or migration verification.
- Database/user provisioning is not automated.
- Import scripts contain hard-coded absolute paths.
- There is no CI configuration.
- There are no rollback migrations.
- There is no complete deployment or production runbook.
