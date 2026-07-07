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
3. Student result page action buttons remain correct:
   - `再做一次` works
   - `回到主畫面` returns to role-selection page
   - `登出` works
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
18. Grade ranking is consistent and eligible-only:
   - `rank_in_grade` never exceeds `total_eligible_in_grade` (no "rank 5 of 1")
   - both are computed only among eligible students (≥100 lifetime questions in that subject)
   - see `supabase_fix_ranking_eligible_only.sql`; after any ranking-SQL change, re-run `recalculate_student_grade_rankings()`

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

- Date (UTC): 2026-07-07
- Deployment ID: `dpl_7tg7oGgd5vgZKad1uNn93e82ksT5`
- Production URL: https://q.hkedutech.com
- Inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/7tg7oGgd5vgZKad1uNn93e82ksT5
- Scope:
  - release baseline recovered to keep the approved tutor-console enhancements from 2026-07-06 (hashed student-summary URL + tutor trending charts)
  - results page bottom action row adds `回到主畫面` and returns to role selection (`login_role`)
  - existing result actions `再做一次` and `登出` remain unchanged
  - keep scope limited to `src/app/page.tsx` on top of recovered baseline
- Validation:
  - `npm run lint` (pass with existing non-blocking `next/no-img-element` warning)
  - `npm test` (pass, 49)
  - `npm run build` (pass)
  - `npm run smoke` (pass, 5/5)
  - production smoke: `/` 200, `/admin` 200, `/tutor` 200, `/reset-password` 200, `/api/admin/console` unauthorized 401, `/api/tutor/session` unauthorized 401, `/api/auth/mobile-login` invalid payload 400
  - production functional check: tutor console uses `/tutor/student/[hash]` route and keeps trend-chart section; results page shows `再做一次` / `回到主畫面` / `登出`
