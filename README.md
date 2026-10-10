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

The expected development database is `crm_dev` on the configured PostgreSQL host and port.

The repository does not provide a database-creation script. The application role needs permission to use and create objects in `crm_dev`.

### 3. Create the environment file

Copy `.env.example` to `.env`, then fill in the values. `.env.example` contains variable names only and must never contain secrets. Set `CRM_PG_URL` to the approved PostgreSQL connection URL for this environment; do not use `DATABASE_URL` or `DIRECT_URL`.

For a Supabase database, download the project root CA certificate from Database Settings → SSL Configuration and set `CRM_PG_CA_CERT` to its local filesystem path. The server uses that certificate to verify Supabase PostgreSQL connections. If it is not set, the connection remains encrypted but certificate verification is unavailable and the server logs one warning per process.

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

By default the API server listens only on the local machine at port `4321`. It connects to PostgreSQL before listening and creates the small authentication schema bootstrap if needed.

### 7. Start Vite

In a second terminal:

```powershell
npm run dev
```

Vite serves the client and proxies `/api` requests to the API server. The browser should use the Vite URL printed by Vite.

### 8. Share with teammates on a LAN

On the computer running the API and Vite development server:

1. Copy `.env.example` to `.env` and set `CRM_PG_URL` without committing the file.
2. Set `CRM_HOST=0.0.0.0` only when sharing on a trusted LAN. Leave it blank for local-only use.
3. Start the API with `npm run server` and start Vite with `npm run dev -- --host 0.0.0.0`.
4. Teammates open `http://HOST_IP:5173`, replacing `HOST_IP` with the host computer's LAN address.
5. For the built server, run `npm run build`, set `CRM_HOST=0.0.0.0`, and run `npm run server`; teammates open `http://HOST_IP:4321`.
6. Allow only the app port (`5173` for development or `4321` for the built server) in the host firewall. Do not expose the PostgreSQL port.

The Vite proxy target is configurable with `VITE_API_PROXY_TARGET`; it defaults to the API on the same computer. Frontend API calls remain relative `/api/...` paths, so teammates do not need a project-specific IP in the client bundle.

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

### Leads bulk upload

Owners and Admins can bulk upload leads from the Leads screen using `.csv` or `.xlsx` files. The upload is previewed and validated before apply; apply re-reads the file and requires the preview SHA-256 hash. Only the first worksheet is read from an `.xlsx` file, and formula cells without cached values are row errors.

Accepted columns are `name` (required), `email`, `phone`, `company`, `lead_type`, `stage`, `permission`, `lead_status`, `owner`, `pso_date`, `next_follow_up`, `city`, `designation`, `lead_number`, and `source_ref`. Headers are case-insensitive and may use spaces, underscores, or supported aliases. Dates accept `YYYY-MM-DD`, real Excel dates, and `DD/MM/YYYY`.

The server limits files to 5 MB, 5,000 data rows, 50 columns, and 2,000 characters per cell. Possible duplicates are detected within the file and against existing leads by normalized phone or lower-cased email; they are skipped by default and can only be imported with the explicit duplicate checkbox. Upload IDs are deterministic (`upload:<file hash>:<row number>`) so re-uploading the same file is idempotent. Uploads do not assign owners or create accounts and contacts.

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

Supabase is the configured database target for this environment. Public tables must remain protected by RLS, with no `anon` or `authenticated` table grants and no public policies unless explicitly reviewed. Scripts that write to Supabase require `ALLOW_SUPABASE_WRITE=1` for that process only and record a script audit entry. Never commit `.env` or database credentials.

Team database changes require a numbered migration in a pull request. Back up the target first; one designated operator applies the approved migration and verifies the recorded migration and counts. Tests use fixtures and must never connect to Supabase. Real customer data must never be copied into development fixtures, logs, docs, or screenshots.

The database currently contains three leads without a created date or source metadata. They are retained and must not be deleted as part of unrelated work.

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
