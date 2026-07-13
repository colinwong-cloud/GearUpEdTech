# AGENTS.md

## Cursor Cloud specific instructions

This is a **Next.js 16 (App Router, Turbopack) + TypeScript + Tailwind** quiz web app ("GearUp Quiz"). The backend is **Supabase** (external, not run locally). There is a single web service; there is no separate backend process to start.

Standard commands live in `package.json` (`dev`, `build`, `lint`, `test`, `smoke`) and setup is documented in `README.md` (see the "Setup" section). Notes below are only the non-obvious things.

### Environment / credentials
- The app reads Supabase config from `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`). The dev server, `npm run build`, and unit tests all boot fine with placeholder values — you do NOT need real Supabase credentials to run/lint/test/build or to render the UI. Real Supabase credentials are only needed for live data (login by mobile, quiz sessions, dashboards fetching data).
- Admin console (`/admin`) auth is fully server-side and self-contained: it validates against `ADMIN_CONSOLE_USER` / `ADMIN_CONSOLE_PASS` and signs a session with `ADMIN_SESSION_SECRET` (must be long, 64+ chars). With these set in `.env.local`, admin login works end-to-end without Supabase. This is the easiest "does the backend work" smoke check.
- `.env.local` is gitignored; recreate it if missing (values can be placeholders as above).

### Running / testing
- Dev server: `npm run dev` (defaults to port 3000). The Playwright config points at `http://127.0.0.1:3000`.
- Playwright smoke tests (`npm run smoke`) reuse an already-running dev server when not in CI (`reuseExistingServer: !CI`). Gotcha: the admin smoke test logs in with `ADMIN_CONSOLE_USER`/`ADMIN_CONSOLE_PASS` from the *test process* env (defaulting to `ci-admin`/`ci-pass`). If you have a dev server already running with *different* admin creds, that test fails on a credential mismatch. Fix by running smoke with matching creds, e.g. `ADMIN_CONSOLE_USER=dev-admin ADMIN_CONSOLE_PASS=dev-pass npm run smoke`, or let Playwright manage its own server. Playwright's chromium browser must be installed (`npx playwright install --with-deps chromium`).
- Unit tests (`npm test`, vitest) are pure-logic tests in `src/lib/*.test.ts` and need no server or network.
- `npm run lint` currently reports 0 errors (one pre-existing `<img>` warning in `src/app/page.tsx`).

### Supabase SQL
- The many `supabase_*.sql` files at repo root are migrations/RPCs applied manually in the Supabase dashboard — they are not run by any local script.
