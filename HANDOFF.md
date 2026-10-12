# Deployment handoff

## Objective

Run the Altus CRM frontend and its secured Node API in the `altuscrm` Vercel project.

## What changed

- Added `api/[...path].cjs`, which exposes the existing CRM Node request handler as a Vercel Function.
- Updated `server/index.cjs` so database initialization is reused by the local Node server and Vercel Function without starting a listener inside a serverless invocation.
- Added `vercel.json` to route `/api/*` to the function and React Router paths to the Vite entry page.
- Added an automated deployment-routing test.
- Added production Vercel settings for `CRM_PUBLIC_URL` and `CRM_BEHIND_PROXY`; no values are recorded here.

## Verification completed

- `npm test`: 90 passed, 1 database integration test skipped because no local CRM database URL was supplied.
- `npm run build`: passed.
- `git diff --check`: passed.
- Two production deployment attempts were uploaded to the `altuscrm` project.

## Remaining manual verification

Vercel CLI reports both new production deployments as `UNKNOWN` and does not return build logs. Open the latest deployment in the Vercel dashboard first and inspect its build log. If it becomes Ready, Vercel Deployment Protection will redirect unauthenticated API checks to its SSO page, so the live API health endpoint must be checked while signed in to Vercel:

1. Open `https://crm.altuscorp.in/api/health`.
2. Confirm it returns the expected JSON health response.
3. Open `https://crm.altuscorp.in` and sign in with an existing CRM account.
4. Confirm `/api/me` succeeds after sign-in and CRM data loads.

## Important notes

- The teammate's `crm` Vercel project was not changed.
- The intended target is `altuscrm`.
- No database migration, import, seed, or live database verifier was run.
- The custom domain must be attached to `altuscrm`; Vercel CLI reported that the domain is managed outside the current `altus-corp1` scope.
- `README.md` and `AGENTS.md` already existed and were retained rather than duplicated.

## Rollback

Promote the previous production deployment from the `altuscrm` Vercel project. This does not modify the database.
