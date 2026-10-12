# Altus CRM project understanding

## Baseline

- Branch/HEAD: current worktree at `d2353fc` (`Fix env loading, BOM handling and safe error reporting for local scripts`).
- Existing worktree changes were preserved. Before this Phase 1 documentation, the worktree already had edits in the Leads screen, shell/navigation, and tests, plus the supplied reference/docs files.
- `npm install`: passed; dependencies installed and audit reported 0 vulnerabilities.
- `npm test`: passed, 51 tests, 0 failures.
- `npm run build`: passed; TypeScript and Vite production build completed.
- `npm run server`: the requested port was already occupied (`EADDRINUSE`); an existing Node process was already serving `127.0.0.1:4321`, and `GET /health` returned HTTP 200. No existing process was stopped.
- `npm run dev -- --host 127.0.0.1`: passed at `http://127.0.0.1:5173/`.

No secrets, credentials, connection strings, or customer values were included in this document.

## Stack and architecture

- Language: TypeScript/TSX for the browser; CommonJS JavaScript for the Node server and tests.
- Frontend: React 19, React DOM, Vite 7, React Router 7. The UI is client-side rendered.
- Backend: Node's built-in HTTP server in `server/index.cjs`; API routing is explicit pathname/method dispatch in that file.
- Database: PostgreSQL, expected local target `crm_dev` on port `5435`, accessed with `pg` and parameterized SQL. There is no ORM.
- Package manager: npm (`package.json` and `package-lock.json`).
- Authentication: server sessions backed by hashed session tokens in HttpOnly SameSite cookies; scrypt password hashing; login throttling; CSRF-style `X-Altus` protection for POST requests; server-side capability checks.
- Routing: React Router routes are declared in `src/main.tsx`; the API routes are declared in `server/index.cjs`.
- State: screen-local React hooks. Shared API calls use `src/shared/api/client.ts`; auth/capability state is under `src/shared/auth/`.
- Styling: plain CSS, tokenized through `src/shared/theme/tokens.css`; there is no Tailwind or component/UI library.
- Screen convention: `src/screens/<name>/page.tsx` renders UI and `function.tsx` owns screen state/API logic. Shared layout/auth/theme code is under `src/shared/`.
- Configuration: `.env` is loaded by `server/load-env.cjs`; variable names are documented in `.env.example`. Values were not read into this report.

## Folder map

```text
.
├── docs/                  project conventions and blueprint-gap docs
├── migrations/            numbered PostgreSQL migrations
├── public/                static brand assets
├── scripts/               migration, setup, import, backup and admin utilities
├── server/                Node HTTP API, database, auth, permissions and imports
├── src/
│   ├── screens/            login, Leads, admin, settings and other CRM screens
│   └── shared/             API client, auth, layout/navigation and theme
├── tests/                 Node test suite and separate live Leads verifier
├── reference/frames/      extracted PNG frames from the supplied GIF
├── README.md
├── WORKFLOW.md
├── AGENTS.md
├── package.json
└── vite.config.ts
```

Ignored from this map: `node_modules`, `.git`, and build output (`dist`).

## Existing Leads implementation

Rendering is in `src/screens/leads/page.tsx`, state and API orchestration are in `src/screens/leads/function.tsx`, and styles are in `src/screens/leads/leads.css`.

Current behavior includes:

- Manage Leads title, refresh, quick-add/new-lead actions, overflow actions and a Leads table.
- Lead views/stage tabs, search, stage, permission, owner, lead status, PSO dates, follow-up filters, counts, sorting, and 50-row pagination capped by the API at 100.
- Detail drawer, lead create/edit, stage and permission updates, products, and account conversion.
- A `My Filters` menu exists, but its filters are only `localStorage` entries under `altus-crm-saved-leads-filters`; it stores the current view and the existing flat `LeadFilters` object. It has apply/delete/save behavior but no database persistence, edit flow, advanced condition rows, or toast.

The Leads data model is centered on `leads`, with related `lead_calls`, `lead_followups`, `lead_history`, `lead_messages`, `lead_products`, and other supporting tables. Migrations `001_phase0_foundation.sql` through `004_accounts_contacts.sql` define the current schema. Migration execution is through `scripts/migrate.cjs`.

Relevant current API endpoints:

- `GET /api/leads` — authenticated, capability-gated list with search, existing flat filters, view predicate, sort, page, page size, and total count.
- `GET /api/leads/counts` — authenticated, capability-gated view counts.
- `GET /api/leads/:id` — lead detail and child collections.
- `POST /api/leads` — create lead.
- `PATCH`/`PUT /api/leads/:id` — update lead.
- `POST /api/leads/:id/stage`, `/permission`, `/products` — targeted lead updates.
- `POST /api/leads/:id/convert-account` — account/contact conversion.

There are currently no quick-filter CRUD routes or persisted quick-filter table.

## Reference GIF observations

The supplied `Create-Quick-Filter.gif` is 1920×848, 534 frames, 30 ms nominal frame duration. All frames were extracted under `reference/frames` as `frame-001.png` through `frame-534.png`.

Observed sequence:

1. Manage Leads initially shows a search field, `My Filters`, `+ Filter`, Add New Lead, a lead grid, and pagination.
2. Clicking `+ Filter` opens a filter menu containing a search field, pinned-filter information, other filters, `Advanced Filters`, and `Configure Fields`.
3. Choosing `Advanced Filters` opens a right-side drawer titled `Advanced Search` over a dimmed Leads page.
4. `Add Condition` opens a field picker. The reference shows fields grouped under Lead Activity, Task, Sales Group, and Lead, with examples such as Prospect Id, 12th Grade Results, Aadhaar Number, and Address 1.
5. A condition is configured with a field, an operator such as `Is`, and a value such as `Demo`; another condition is added. The drawer exposes `+ AND` and `+ OR` controls.
6. Conditions are summarized in a row with edit and remove icons. The footer contains `Save as Quick Filter` and `Show Results`.
7. `Save as Quick Filter` opens a centered dialog titled `Save as Quick Filter` with a required Name field, Cancel, and Save. The recording enters `Completed Demo` and shows the save-in-progress state.

The reference uses third-party branding in its captured UI; implementation must use Altus CRM branding and existing project tokens instead.

## Verification limitations

- The repository's ordinary automated suite does not start Playwright and has no Playwright dependency/script today.
- The API server was already running during this inspection, so a second start correctly failed with `EADDRINUSE`; the existing health endpoint was verified instead.
- No migrations, live verifier, or customer-data inspection were run during Phase 1.
