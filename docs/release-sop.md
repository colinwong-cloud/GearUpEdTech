# Release SOP (Must-Not-Break)

This SOP defines the mandatory release flow and regression controls.

## 1) Source of truth

- Production deploys must come from an approved release branch that will be merged into `main`.
- Do not release unreviewed local-only changes.
- Record deployment metadata in `README.md` for every production rollout.

## 2) Mandatory flow

1. Implement change on branch.
2. Run validation gate (`npm test`, `npm run lint`, `npm run build`, smoke checks).
3. Deploy Preview and share URL.
4. Wait for explicit owner approval.
5. Deploy Production.
6. Run post-deploy smoke checks.
7. Update README release log + handover.

## 3) Critical feature registry

Every release must re-check these critical features:

1. Login page standalone **「新用戶註冊」** CTA.
2. Registration/add-student **gender required**.
3. Student result page action buttons remain correct.
4. Student result page wrong-answer analysis remains readable and includes:
   - question content
   - student answer (with value)
   - correct answer (with value)
   - explanation
5. Admin key tabs and KPI summary modules remain available.
6. Registration referral code flow remains correct:
   - optional 6-digit numeric input
   - invalid code shows `錯誤編號`
   - exhausted code shows `編號被限，請負責老師聯絡管理員更新編號。`
   - referral errors appear under referral field and do not clear other form inputs
7. Admin `教師編號維護` remains available with:
   - code creation
   - usage summary
   - code detail query including parent paid status (free/paid)
   - CSV/PDF export for current query result
   - admin reset action: input tutor code and reset tutor login password to `123456`
   - reset clears lockout state and forces first-login password change (`must_change_password = true`)
8. Parent free-tier invite CTA copy remains accurate and includes both:
   - unlimited-practice value (`解鎖無限題目練習`)
   - ranking value (`可獲得學生排名資訊`)
9. Paid parent dashboard payment history remains available:
   - paid users can view `消費紀錄`
   - includes year filter and columns for date / amount / payment method
10. Ranking/benchmark cohort excludes test parents (`mobile_number LIKE '999%'`).
11. Parent practice email readability remains available:
   - wrong-question details block appears in email
   - includes question content / student answer / correct answer / explanation
12. Tutor entrance modern UI remains available:
   - `/tutor` uses approved contemporary Variant B style
   - first-login password-change page matches the same design language
13. Tutor student detail page action layout remains available:
   - `/tutor/student/[hash]` keeps `返回導師主頁` + `登出` at page bottom
   - both actions use the same light-blue button style
14. Tutor dashboard logout action layout remains available:
   - `/tutor` keeps `登出` at page bottom action area (not header)
   - logout button style matches the same light-blue action style
15. Admin business KPI today new parent summary table remains available:
   - `/admin` > `業務概覽` shows `今日新註冊家長摘要` between 今日實時 and 月結及趨勢 sections
   - table columns include `手機號碼` / `電郵` / `建立時間（HKT）`
16. Tutor student-summary URL hides the raw mobile:
   - tutor list links to `/tutor/student/<hash>` (opaque HMAC token), never the mobile number
   - opening a student summary loads sessions correctly and still shows `登記手機` in the page header
   - a tutor can only resolve hashes for mobiles bound under their own referral code
17. Tutor student summary shows the parent-dashboard trending charts:
   - `整體正確率趨勢（最近30次）` and `各題型正確率趨勢` render between the summary cards and the sessions table
   - charts follow the selected subject tab and reuse the shared `src/components/student-performance-charts.tsx`
   - parent dashboard still renders the same trend chart (shared component, no regression)

## 4) Validation gate

- `npm test`
- `npm run lint` (or accepted known warnings only)
- `npm run build`
- `npm run smoke` (if available)
- If smoke fails for environment tooling reasons (e.g. browser binary missing), fix tooling first and rerun.

## 5) Documentation discipline

After production deploy, update:

- `README.md` latest deployment metadata
- changelog entry
- handover note with gate evidence and smoke outcomes

## 6) Latest deployment record

- Date (UTC): 2026-07-06
- Deployment ID: `dpl_6h5ziATUeApRJzYcBZbmChkHqepT`
- Production URL: https://q.hkedutech.com
- Inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/6h5ziATUeApRJzYcBZbmChkHqepT
- Scope:
  - tutor student summary now shows the parent-dashboard trending charts (`整體正確率趨勢（最近30次）` + `各題型正確率趨勢`) between the summary cards and the sessions table
  - parent-dashboard charts extracted into shared `src/components/student-performance-charts.tsx`; `src/app/page.tsx` imports the same component (behaviour unchanged)
  - `/api/tutor/sessions` returns per-student `charts` via the existing `get_student_chart_data` RPC, scoped to the tutor's bound mobiles; no new chart logic or new RPC
- Validation:
  - `npm run lint` (pass with existing non-blocking `next/no-img-element` warning)
  - `npm test` (pass, 49)
  - `npm run build` (pass)
  - `npm run smoke` (pass, 5/5)
  - production smoke: `/` 200, `/admin` 200, `/tutor` 200, `/reset-password` 200, `/api/admin/console` unauthorized 401, `/api/tutor/session` unauthorized 401, `/api/auth/mobile-login` invalid payload 400
  - production functional check: tutor `112233` login → student summary shows `整體正確率趨勢（最近30次）` + `各題型正確率趨勢` above the sessions table; parent dashboard (`99990002`) trend chart still renders (shared component, no regression)
