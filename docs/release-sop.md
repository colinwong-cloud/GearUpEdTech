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

## Release record

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
