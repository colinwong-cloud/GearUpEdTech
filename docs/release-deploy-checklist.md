# Release Deploy Checklist

Reference SOP: `docs/release-sop.md`

> Copy this checklist into the release PR description (or link to the completed run notes) and keep it with deployment evidence.

## A. Release identity / source of truth

- [ ] Target production SHA is on `main`
- [ ] Release branch / PR is identified
- [ ] `git diff --name-only origin/main...HEAD` reviewed
- [ ] Release scope documented

## B. Merge-before-deploy control

- [ ] Preview deployment created from feature/release branch
- [ ] Owner approval captured in chat
- [ ] Changes merged into `main`
- [ ] Production deploy executed from merged `main` SHA

## C. Critical feature registry checks (must-not-break)

- [ ] Login page has large standalone **「新用戶註冊」** button above login form
- [ ] Admin includes **「學生練習摘要」/「家長學生練習摘要」**
- [ ] Admin KPI includes **「今日新註冊家長摘要」**
- [ ] New student registration requires **性別**
- [ ] Result page includes **重新選擇科目** and **返回主畫面**
- [ ] Account maintenance includes paid-user **「消費紀錄」** (date/amount/method + year filter)
- [ ] Admin **「家長學生練習摘要」** has grade-level monthly frequency summary with subject + month selectors and 3 metrics

## D. Technical validation gate

- [ ] `npm test` passed
- [ ] `npm run lint` passed (or accepted existing warnings only)
- [ ] `npm run build` passed
- [ ] `npm run smoke` passed
- [ ] If no smoke script, fallback smoke checks executed and recorded

## E. Post-deploy production checks

- [ ] `GET /` returns 200
- [ ] `GET /admin` returns expected status
- [ ] Admin APIs unauthorized path still returns 401 when no auth
- [ ] Manual spot check of critical feature registry completed

## F. Release record updates

- [ ] README latest production deployment updated
- [ ] README changelog entry added (if release scope is non-trivial)
- [ ] README handover note updated with validation + deploy metadata

## G. Deployment metadata (fill in)

- Date (UTC):
- Release PR:
- Merge commit SHA (`main`):
- Production deployment ID:
- Production URL:
- Inspector URL:
- Owner approval reference:
- Residual risks / known warnings:
