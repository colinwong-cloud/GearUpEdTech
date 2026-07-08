# Release SOP

## Purpose

This SOP is the required release gate for GearUp Quiz production deployments.
Every release must pass validation, include rollback context, and confirm that paid-tier status behavior stays aligned with Airwallex charge results.

## Mandatory pre-release checks

1. Confirm branch is pushed and PR is up to date.
2. Run local quality gate:
   - `npm run lint`
   - `npm test`
   - `npm run build`
3. Confirm production cron schedule includes:
   - `/api/cron-recurring-payments` (daily)
4. Confirm production runtime secrets exist:
   - `CRON_SECRET`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AIRWALLEX_CLIENT_ID`
   - `AIRWALLEX_API_KEY`

## Mandatory post-deploy checks

1. Verify production deployment is `READY` and aliased.
2. Smoke check key routes:
   - `/` => 200
   - `/admin` => 200
   - `/api/cron-recurring-payments` without bearer => 401
3. Record deployment ID, test evidence, and behavior notes in this SOP.

## Recurring paid-tier policy (Airwallex-aligned)

1. Monthly renewal requires an actual MIT charge request to Airwallex.
2. Local paid status is retained only when recurring charge reaches success state.
3. If renewal is pending, recheck on next daily run (no duplicate charge creation).
4. If renewal fails, retry on next daily run.
5. If no successful renewal extends `paid_until`, account naturally becomes unpaid.

## Feature retention gate (must-check before preview/prod)

1. Cross-check Admin console tabs against required baseline:
   - `業務概覽`
   - `題目配額`
   - `學生練習摘要`
   - `付款狀態查詢`
   - `刪除帳戶`
   - `電郵通知`
   - `題目管理`
   - `折扣碼維護`
   - `教師編號維護`
2. Cross-check API actions in `src/app/api/admin/console/route.ts` include:
   - `parent_students_practice_summary`
   - `grade_level_practice_frequency_summary`
   - `tutor_referral_code_create`
   - `tutor_referral_code_summary`
   - `tutor_referral_code_usage_details`
   - `tutor_referral_password_reset`
   - payment status / recurring monitor actions
3. Cross-check GitHub PR history (`gh pr list --state all`) to ensure feature branches that introduced current baseline modules are still represented before releasing.

## Automated anti-missing framework (enforced)

1. Machine-readable feature registry:
   - `docs/feature-registry.json`
2. Automated checker:
   - `scripts/feature-retention-check.mjs`
   - local command: `npm run feature:retention`
3. Full gate command (local and CI):
   - `npm run release:gate`
4. CI policy:
   - GitHub Action `.github/workflows/release-gate.yml` runs on PRs to `main`
   - build must fail if required files/markers are missing
5. Change policy:
   - every newly approved "must-retain" feature must be added to `docs/feature-registry.json` in the same PR

## Release record

### 2026-07-08 — Feature retention recovery + anti-missing framework deployment

- Branch: `cursor/recover-feature-retention-pack-2d42`
- Commits:
  - `f1d2e30` restore missing retained feature modules
  - `7d18e9d` restore shared consent/gender utility dependencies
  - `520a652` add automated anti-missing framework (registry + checker + CI gate)
- PR: https://github.com/colinwong-cloud/GearUpEdTech/pull/109
- Production deployment:
  - ID: `dpl_HyPm4q4sJXyDE6uXr8fesSMJPj3y`
  - Inspect: https://vercel.com/colinwong-clouds-projects/quiz-deploy/HyPm4q4sJXyDE6uXr8fesSMJPj3y
  - URL: https://quiz-deploy-obojf2uda-colinwong-clouds-projects.vercel.app
  - Alias: https://q.hkedutech.com
- Scope:
  - Restore missing approved modules/features:
    - result page retained actions and readability markers
    - parent email wrong-question readability block
    - payment history API path
    - feedback notification API path
    - tutor portal pages/API and related shared modules
    - Admin KPI today-new-parent registration table/payload
  - Enforce anti-missing framework in repository and CI:
    - `docs/feature-registry.json`
    - `scripts/feature-retention-check.mjs`
    - `.github/workflows/release-gate.yml`
    - npm scripts: `feature:retention`, `release:gate`
- Validation evidence:
  - `npm run release:gate` passed
    - `npm run feature:retention` passed (13 file checks + 22 marker checks)
    - `npm run lint` passed (1 pre-existing warning: `@next/next/no-img-element` in `src/app/page.tsx`)
    - `npm test` passed (12 files, 49 tests)
    - `npm run build` passed
  - Production smoke checks passed:
    - `GET /` => 200
    - `GET /admin` => 200
    - `GET /tutor` => 200
    - `GET /api/cron-recurring-payments` without bearer => 401
- SQL required: none for this release.

### 2026-07-08 — Daily recurring policy hardening

- Branch: `cursor/airwallex-recurring-daily-policy-2d42`
- Commit: `b406487`
- PR: https://github.com/colinwong-cloud/GearUpEdTech/pull/108
- Production deployment:
  - ID: `dpl_2FoQABCJ9eK6uh4v1wJoFWovTrxD`
  - Inspect: https://vercel.com/colinwong-clouds-projects/quiz-deploy/2FoQABCJ9eK6uh4v1wJoFWovTrxD
  - URL: https://quiz-deploy-ektobwnjn-colinwong-clouds-projects.vercel.app
  - Alias: https://q.hkedutech.com
- Scope:
  - Harden `/api/cron-recurring-payments` to reconcile open recurring orders.
  - Add paid/pending/failed classification for Airwallex renewal outcomes.
  - Keep profiles retryable daily for failed renewals (no permanent one-shot lockout).
  - Add recurring cron completion/error logs for operations visibility.
- Validation evidence:
  - `npm run lint` passed (1 pre-existing warning: `@next/next/no-img-element` in `src/app/page.tsx`)
  - `npm test` passed (8 files, 31 tests)
  - `npm run build` passed
  - Smoke checks passed (`/`=200, `/admin`=200, recurring cron unauthenticated=401)
- SQL required: none for this release.
