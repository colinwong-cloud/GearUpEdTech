# Release SOP (Must-Not-Break)

This SOP is the source of truth for how releases move to production without losing previously approved features.

## 1) Release source of truth

- Production deploys must come from a **`main` commit SHA** only.
- Do not deploy side branches directly to production.
- Every production release must record:
  - Git commit SHA on `main`
  - Vercel deployment ID
  - Production URL

## 2) Mandatory merge-before-deploy flow

Required flow:

1. Feature branch development
2. Preview deployment
3. Owner approval in chat
4. Merge into `main`
5. Deploy the merged `main` SHA to production

If a branch is not merged into `main`, it is not releasable.

## 3) Critical feature registry (anti-regression)

Each release must explicitly verify these critical features:

1. Login page has large standalone **「新用戶註冊」** button above login form.
2. Admin console includes **「學生練習摘要」/「家長學生練習摘要」**.
3. Admin KPI includes **「今日新註冊家長摘要」**.
4. New student registration requires **性別** selection.
5. Student result page shows bottom actions:
   - **重新選擇科目**
   - **返回主畫面**

## 4) Required validation gates

For every release, run and record:

- `npm test`
- `npm run lint` (or accepted pre-existing warnings only)
- `npm run build`
- `npm run smoke` (if available)
- If smoke script is unavailable, run documented fallback smoke checks

## 5) Branch protection requirements for `main`

- Pull request required (no direct push)
- Required status checks must pass
- At least one approval required
- Branch must be up to date before merge

## 6) Release record discipline

After every production deployment:

1. Update `README.md` with latest deploy metadata and release scope.
2. Add a handover note with validation evidence and any residual risk.
3. Keep changelog entries for major feature restores/fixes.

## 7) Emergency exception handling

If an emergency hotfix is deployed from a non-main source:

1. Immediately back-merge/cherry-pick into `main`.
2. Re-run validation gate on `main`.
3. Re-baseline README release record to the `main` SHA.

## 8) Checklist location

Use `docs/release-deploy-checklist.md` for every release PR and deployment run.
