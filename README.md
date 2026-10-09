# Altus CRM

Altus CRM is a single-tenant CRM for one company. It is not a multi-tenant SaaS product: the repository has no tenant slugs, tenant registry, platform console, per-tenant schemas, or cross-company logic.

The application is a client-side rendered React and TypeScript UI served by Vite during development, with a Node HTTP server in `server/` and PostgreSQL for persistence. React Router provides client-side routing. There is no Next.js, Tailwind, or UI component library.

## Source of truth

The current Git branch is the source of truth. Do not overwrite it with older material from another project or branch. The older project at `A:\office\Workflow\Altus-CRM` and its live database on port `5433` are read-only references and must never be touched by this project.

The UI conventions are defined in [docs/conventions.md](docs/conventions.md). Screen code follows `src/screens/<name>/page.tsx` for rendering and `function.tsx` for screen state and API calls. Shared code is under `src/shared/`. Colors come from `src/shared/theme/tokens.css`.

## Prerequisites

- Node.js and npm.
- PostgreSQL with a local development database named `crm_dev` on port `5435`.
- PostgreSQL client tools when using the dump/restore scripts: `pg_dump`, `pg_restore`, and `psql`.
- A local PostgreSQL role for the application.

The repository does not include a PostgreSQL installer, database provisioning script, or CI setup. Database provisioning remains a known gap.

## Setup

### 1. Install dependencies

```powershell
npm install
```

### 2. Create the local database and role

Using a PostgreSQL administrator connection, create the application role and the development database. Use a locally chosen password; do not put it in Git or print it in logs.

The expected connection target is:

```text
127.0.0.1:5435/crm_dev
```

The repository does not provide a database-creation script. The application role needs permission to use and create objects in `crm_dev`.

### 3. Create the environment file

Copy `.env.example` to `.env`, then fill in the values. `.env.example` contains variable names only and must never contain secrets.

The supported names are:

```text
CRM_PG_URL
CRM_OWNER_EMAIL
CRM_OWNER_PASSWORD
```

The server also reads optional process environment variables for host/port/static serving and proxy behavior. Import tooling additionally uses `CRM_IMPORT_PG_URL`. See `server/load-env.cjs`, `server/index.cjs`, `server/seed-owner.cjs`, and `server/import-altus.cjs` for the actual names.

Never commit or print `.env`, `login.txt`, passwords, keys, hashes, or connection strings. Set environment variables per process where possible.

### 4. Apply migrations

The migration runner is a CommonJS script, not an npm script:

```powershell
node scripts/migrate.cjs
```

It only accepts the guarded local `crm_dev` target on port `5435`, applies numbered files in order, and records applied filenames in `schema_migrations`.

### 5. Seed the owner

The owner seed script is also not an npm script:

```powershell
node server/seed-owner.cjs
```

It uses the owner environment variables, creates or updates the owner account, hashes the password with the project security code, and clears that owner’s sessions.

### 6. Start the API server

In one terminal:

```powershell
npm run server
```

The default API server listens on `127.0.0.1:4321`. It connects to PostgreSQL before listening and creates the small authentication schema bootstrap if needed.

### 7. Start Vite

In a second terminal:

```powershell
npm run dev
```

Vite serves the client and proxies `/api` requests to the API server. The browser should use the Vite URL printed by Vite.

## Navigation and authorization

Every role receives these six core navigation items:

- Leads
- Marketing
- Reports
- Quote & Invoicing
- Accounts & Contacts
- Tasks & Activity

Admin groups are shown only when the `nav.admin` capability is present. Old lead stages are filters/tabs inside Leads, not separate top-level navigation items. The server enforces authorization; hiding a UI item is not a security boundary. Client and server capability maps must remain mirrored.

## Tests and build

Run the ordinary Node test suite:

```powershell
npm test
```

Run the TypeScript check and production build:

```powershell
npm run build
```

The separate live database verifier is:

```powershell
node tests/verify-leads-live.cjs
```

It is not part of `npm test`, requires the guarded local database target, and performs live database verification. Never run it implicitly as part of a unit-test command.

Other available package commands are `npm run preview` and `npm run dev`. There are no npm scripts for migrations, owner seeding, user management, import, dump, restore, or migration verification.

## Import procedure

The import workflow is separate from ordinary application startup:

1. Use `scripts/dump-old-altus.ps1` to create a custom PostgreSQL dump from the old reference system. It excludes credential/session/secret/identity/invite data.
2. Use `scripts/restore-to-import.ps1` to recreate the guarded `crm_import` database and restore the dump.
3. Configure the target and import connection variables per process.
4. Run `node server/import-altus.cjs --dry-run` and review the report.
5. Run `node server/import-altus.cjs --verify` to compare source and target counts/checksums and verify child links and selected conversions.
6. Run `node server/import-altus.cjs --apply` only after review and approval.

The importer uses source IDs and checksums for idempotent updates. It records import runs in the target database. The scripts contain hard-coded local paths and guarded database targets; those are known gaps.

## Security rules

Preserve the existing security model:

- scrypt password hashing;
- hashed session tokens;
- HttpOnly, SameSite cookies;
- the `x-altus` header on POST requests;
- login throttling;
- security headers;
- server-side authorization;
- mirrored client/server role maps.

Real customer data stays in the local development database. Documentation, tests, fixtures, logs, and screenshots must contain counts or synthetic values only, never customer values.

## Known gaps

- No npm scripts exist for migrate, seed, import, dump, restore, or migration verification.
- Database/user provisioning is not automated.
- Import and restore scripts contain hard-coded absolute paths.
- The import/restore workflow has no repository runbook beyond the scripts themselves.
- There is no CI configuration.
- There are no rollback migrations.
- There is no single clean-rebuild command for the application database.
- The project has no deployment or production operations guide.
- The repository does not document PostgreSQL installation/service setup.
