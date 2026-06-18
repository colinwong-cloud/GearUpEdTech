# Release SOP (Must-Not-Break)

This SOP is the source of truth for shipping to production without dropping previously approved features.

## 1) Release source of truth

1. Preview deployment must come from a dedicated feature branch (`cursor/*-2d42`).
2. Production deploy should come from merged `main` SHA whenever possible.
3. Every release must record:
   - Deployment ID
   - Inspector URL
   - Production URL
   - Validation evidence

## 2) Mandatory merge-before-deploy flow

Required sequence:

1. Implement on feature branch
2. Deploy preview
3. Owner approval in chat
4. Validate (`lint`, `test`, `build`, smoke/fallback smoke)
5. Merge to `main`
6. Deploy production

## 3) Critical feature registry (anti-regression)

Every release must explicitly verify all items below:

1. Login page has standout **新用戶註冊** button.
2. Paid-tier CTA copy is:
   - **成為月費會員(每月$99)，即可以解鎖無限題目練習並可獲得學生排名資訊。**
3. Registration requires **性別** selection.
4. Registration has optional **負責教師編號** with inline errors:
   - **錯誤編號**
   - **編號被限，請負責老師聯絡管理員更新編號。**
5. Admin has **教師編號維護**:
   - create 6-digit tutor codes
   - summary table
   - usage details (mobile + parent paid/free status)
6. Admin has **家長學生練習摘要** and **今日新註冊家長摘要**.
7. Admin grade-level practice frequency summary includes:
   - month selector
   - subject selector (all/Chinese/English/Math)
8. Student result page includes bottom actions:
   - **重新選擇科目**
   - **返回主畫面**
9. Student result wrong-answer readability is question-by-question with:
   - 題目內容
   - 你的答案（含值）
   - 正確答案（含值）
   - 解釋
10. Parent session detail wrong-answer readability follows same 4-block format.
11. Account maintenance includes paid-user **消費紀錄**:
    - default current year
    - year filter
    - date/amount/payment method columns

## 4) Required validation gates

Run and record for each release:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm run smoke` if script exists
5. If no smoke script exists, run fallback smoke:
   - `GET /` returns 200
   - `GET /admin` returns 200
   - `POST /api/admin/console` without auth returns 401

## 5) Release record discipline

After production deploy:

1. Update `README.md` latest deployment metadata.
2. Append changelog entry for release scope.
3. Update this SOP and `docs/release-deploy-checklist.md` when gates change.

## 6) Latest deployment record

- Date (UTC): 2026-06-18
- Deployment ID: `dpl_3RLCGthqkGPMRUyrHERuGcb66hpG`
- Production URL: https://q.hkedutech.com
- Inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/3RLCGthqkGPMRUyrHERuGcb66hpG
- Scope:
  - recovery bundle for missing approved features (referral, payment history, admin summaries/KPI, result bottom actions, registration CTA/copy)
  - restore result wrong-answer readability blocks (student + parent views)
- Validation:
  - `npm run lint` (pass with existing non-blocking `next/no-img-element` warning)
  - `npm test` (pass)
  - `npm run build` (pass)
  - fallback smoke checks on production: `/` 200, `/admin` 200, `/api/admin/console` unauthorized 401
