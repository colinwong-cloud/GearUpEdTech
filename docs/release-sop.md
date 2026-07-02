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

- Date (UTC): 2026-07-02
- Deployment ID: `dpl_7D8PTuBBjykiRLFcVSYfHsNNhisR`
- Production URL: https://q.hkedutech.com
- Inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/7D8PTuBBjykiRLFcVSYfHsNNhisR
- Scope:
  - hotfix restore for parent email wrong-question readability
  - restore wrong-question details block in parent practice email
  - keep scope limited to `src/app/api/send-quiz-email/route.ts`
- Validation:
  - `npm run lint` (pass with existing non-blocking `next/no-img-element` warning)
  - `npm test` (pass)
  - `npm run build` (pass)
  - `npm run smoke` (pass, 5/5)
  - production smoke: `/` 200, `/admin` 200, `/tutor` 200, `/reset-password` 200, `/api/admin/console` unauthorized 401, `/api/tutor/session` unauthorized 401, `/api/payment/history` invalid payload 400, `/api/send-quiz-email` invalid payload 400
