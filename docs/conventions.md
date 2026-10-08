# Project conventions

- The UI is client-side rendered only; do not add SSR, hydration, Next.js, or server-rendered UI.
- UI source files under `src/` use `.ts` or `.tsx`; backend and test CommonJS files remain `.cjs`.
- `page.tsx` files render UI, while `function.tsx` files hold screen state and logic.
- Styles use tokens from `src/shared/theme/tokens.css` instead of hard-coded colors.
- Role rules are defined in one capability map and mirrored for the client and server.
- The six core navigation items (Leads, Marketing, Reports, Quote & Invoicing, Accounts & Contacts, and Tasks & Activity) are shown to every role; extended sidebar groups require the `nav.admin` capability.
