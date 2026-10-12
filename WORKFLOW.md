# Altus CRM workflow

## Operating principles

- The current branch is the source of truth: current branch (`phase-0-foundation` at time of writing; update when renamed or merged).
- Never overwrite the current branch with older material.
- The older project at `A:\office\Workflow\Altus-CRM` and its live database on port `5433` are read-only references and must never be touched.
- This is a single-tenant CRM for one company. Do not introduce tenant slugs, tenant registries, platform-console concepts, per-tenant schemas, or cross-company logic.
- Run as-is first. Avoid large refactors.
- Read `README.md`, `WORKFLOW.md`, `AGENTS.md`, environment templates, and relevant history before architectural changes.
- Plan first: list files, endpoints, data model, tests, risks, and rollback. Wait for approval before building. Build one phase only, then stop and report.
- Commit only when the owner explicitly says to commit. Never use `git reset --hard`, `git clean -fd`, or force-push. Back up before deleting anything large.

## Current product phases

| Phase | Current repository status | Working mode |
|---|---|---|
| Leads | Core list, filters, pagination, detail, CRUD and activity APIs are present. Lead round-robin assignment is implemented; Daily Calling Engine, timers and reporting are not yet implemented. | Active |
| Accounts & Contacts | Placeholder view over lead data; no outbound marketing automation or channel sender is implemented. | Placeholder |
| Tasks & Activity | Placeholder view over lead data; no outbound marketing automation or channel sender is implemented. | Placeholder |
| Reports | Placeholder view over lead data; no outbound marketing automation or channel sender is implemented. | Placeholder |
| Quote & Invoicing | Placeholder view over lead data; no outbound marketing automation or channel sender is implemented. | Placeholder |
| Marketing | Placeholder view over lead data; no outbound marketing automation or channel sender is implemented. | Placeholder |
| Dashboard | No dashboard route or dedicated dashboard screen exists in the current repository. | Not started |

The six core navigation items are available to every role. Admin groups appear only with the `nav.admin` capability. Old stages remain filters/tabs inside Leads.

## Later candidates

Each candidate requires its own plan before implementation, including affected files, endpoints, data model, tests, risks, and rollback:

- Opportunities
- Support tickets
- Telephony
- Messaging
- Daily Calling Engine (planned, not implemented)
- Assignment automation (lead round-robin is implemented; broader automation remains planned)
- Custom fields
- Deduplication

## Business rules to confirm

The following are planning rules only and must be explicitly confirmed before being treated as implemented behavior:

- Planned process: Lead -> Qualified -> Permission to Call -> Assignment -> Calling -> Follow-up -> PSO/Event -> Attendance -> PS Registration -> Sales -> Payment; only portions of this flow are currently implemented.
- Permission to Call = Yes is a required business rule; the call-write endpoint enforces it (Slice 2).
- Round-robin assignment is implemented for configured rules and eligible users; named-caller override and broader assignment automation remain planned.
- Daily targets have a data model and settings UI; daily list generation, carry-forward and pool shortfall logic are not implemented.
- Stage integrity: lead stages come from shared/lead-stages.json (includes pool, duringpso, completed) and are used by server writes, the importer and the Leads UI.
- `Balance = Payable - Paid`.
- `Target Date = Last Payment Date + 3 days`.

## Session start checklist

1. Confirm the current branch with `git branch --show-current`.
2. Run `git status`.
3. Run `git log -3`.
4. Confirm required files exist: `README.md`, `WORKFLOW.md`, `AGENTS.md`, `docs/conventions.md`, `package.json`, migrations, server code, and tests.
5. Check environment templates and names without printing values.
6. Run `npm test`.
7. Run `npm run build`.
8. If tests or build cannot run, report the exact reason before changing code.
9. Do not run `tests/verify-leads-live.cjs` implicitly. It is a live database verifier, not a unit test.

## Implementation rules

- Keep React CSR with Vite and React Router.
- Keep `src/screens/<name>/page.tsx` render-focused and `function.tsx` focused on state/API logic.
- Keep shared code under `src/shared/`.
- Use color tokens from `src/shared/theme/tokens.css`.
- No Next.js, Tailwind, or UI library without explicit approval.
- Keep unrelated screens unchanged.
- Use numbered migrations through `scripts/migrate.cjs`.
- Imports must support dry-run, apply, and verify modes and remain idempotent by source ID.
- Never expose secrets, passwords, keys, hashes, connection strings, or customer values.
- Keep real customer data in the local development database; output counts only.

## Supabase operations

Supabase is the configured database target. All public tables use RLS and `anon`/`authenticated` receive no table, sequence, or function grants. No policies are added without review. Use a limited application role for runtime access; migrations use a separate operator role.

Database changes require a numbered `.sql` migration in a pull request. Back up the target first, then one designated operator applies the migration and verifies the migration record and counts. Any write-capable script must refuse Supabase unless `ALLOW_SUPABASE_WRITE=1` is set for that process. Tests must never use Supabase. Real customer data must never appear in development fixtures, logs, docs, or screenshots.

For a Supabase backup, use `pg_dump` with the direct database connection or the session pooler on port `5432`. Do not use the transaction pooler on port `6543` for backups. `scripts/backup-migration.cjs` is not a sufficient Supabase backup because it is not a `pg_dump` backup and does not verify the server certificate.

Three existing leads have no created date or source metadata. Preserve them; do not delete them as cleanup.
- Preserve scrypt hashing, hashed session tokens, HttpOnly SameSite cookies, `x-altus` POST protection, throttling, security headers, and server-side authorization.
- Hidden UI is never security. Client/server role maps must stay mirrored.

## Session end report template

```text
Objective:

Branch / HEAD:

Files changed:

Behavior changed:

Tests run and results:

Build result:

Manual checklist:

Syntax-checked only:

Could not run and why:

Database/import activity:

Secrets/customer-data safety:

Rollback plan:

Git status:

Commit:
```

Definition of done: tests and build pass, the manual checklist is listed, documentation is updated, and Git status is clean or the remaining changes are explicitly listed. Never claim completion when required work remains.
