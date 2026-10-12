# Vercel deployment

## Architecture

Vercel serves the React/Vite production build from `dist/`. The Node CRM API is deployed as the `api/[...path].cjs` Vercel Function. The function imports the existing secured CRM request handler from `server/index.cjs`.

Routing is defined in `vercel.json`:

- `/api/*` is handled by the Node API function.
- Static build assets are served directly.
- Other paths, including `/leads`, fall back to `index.html` for React Router.

## Required Production environment variables

Configure these in the target Vercel project. Never commit or paste their values into source control, documentation, or logs.

| Variable | Purpose |
| --- | --- |
| `CRM_PG_URL` | Approved Supabase PostgreSQL runtime connection string. |
| `CRM_OWNER_EMAIL` | Initial owner account email. |
| `CRM_OWNER_PASSWORD` | Initial owner account password. |
| `CRM_PUBLIC_URL` | Public CRM URL, for example `https://crm.altuscorp.in`. |
| `CRM_BEHIND_PROXY` | Set to `1` on Vercel so session cookies are marked Secure. |

`DATABASE_URL` and `DIRECT_URL` are not read by this application server. They may exist for platform tooling, but the CRM runtime uses `CRM_PG_URL`.

## Deploy

Run from the repository root after tests and build succeed:

```powershell
vercel --prod --yes --project altuscrm
```

Vercel environment changes apply only to deployments created after the change.

## Verify

When Vercel Deployment Protection is enabled, sign in to Vercel first. Then open:

```text
https://crm.altuscorp.in/api/health
```

Expected response:

```json
{"ok":true,"app":"altus-crm","singleTenant":true}
```

Then sign in using an existing CRM account and verify that the browser receives a secure, HttpOnly session cookie.

## Rollback

In Vercel, promote the previous known-good production deployment for the `altuscrm` project. This reverts routing and application code without changing the database or environment variables.
