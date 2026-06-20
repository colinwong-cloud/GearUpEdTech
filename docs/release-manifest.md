# Release Manifest

## Release identity

- Release date (UTC): 2026-06-19
- Release branch: `cursor/recover-missing-features-2d42`
- PR URL: https://github.com/colinwong-cloud/GearUpEdTech/pull/92
- Preview URL: https://quiz-deploy-bmzzxlp7a-colinwong-clouds-projects.vercel.app
- Preview inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/FWEGZHb83ADZydwGL634n4AgVGwy
- Planned production source (`main` SHA preferred): `cursor/recover-missing-features-2d42` (temporary recovery rollout)
- Production deployment: `dpl_D3wmAftfzJqjxHfo151fmx2BfVCR`

## Included in this release

| Feature ID | Feature | Reason for inclusion | Validation owner |
|---|---|---|---|
| F-EMAIL-READABILITY | Parent email wrong-question detail cards readability | Feature had regressed and required immediate restore | owner + agent |
| F-RESULT-READABILITY-STUDENT | Student result readability 4-block format | Must-not-break recovery guard | owner + agent |
| F-RESULT-READABILITY-PARENT | Parent session detail readability 4-block format | Must-not-break recovery guard | owner + agent |
| F-REFERRAL-FRONTEND | Registration optional 負責教師編號 + inline errors | Previously approved and missing | owner + agent |
| F-REFERRAL-ADMIN | Admin 教師編號維護 | Previously approved and missing | owner + agent |
| F-PAYMENT-HISTORY | Paid-user 消費紀錄 + year filter | Previously approved and missing | owner + agent |

## Deferred/Parked (explicitly not in this release)

| Feature ID | Feature | Current status | Reason deferred | Next action |
|---|---|---|---|---|
| F-TUTOR-PACKAGE | Tutor package checkout flow | parked | Owner requested to park this module | Resume only when owner requests continuation |

## Must-not-break verification

Reference: `docs/feature-registry.md` (B1 + B2 packs)

- Critical inventory result: PASS
- B2-0 Test Preconditions: PASS
- B2-1 E2E Entry / Authentication: PASS
- B2-2 Student-side Flow: PASS
- B2-3 Parent-side Flow: PASS
- B2-4 Account Maintenance: PASS
- B2-5 Payment Module: PASS
- B2-6 Admin Console: PASS
- B2-7 Sharing / Tracking / Compliance: PASS

## Validation evidence

- `npm run lint`: PASS (existing non-blocking `next/no-img-element` warning only)
- `npm test`: PASS
- `npm run build`: PASS
- `npm run smoke` or fallback smoke: fallback smoke PASS (`/` 200, `/admin` 200, `/api/admin/console` unauthorized 401)

## Gatekeeper approvals

- Owner approval reference: chat approval before production deployment (2026-06-19)
- Gatekeeper agent result: PASS
- Residual risks: none beyond known existing non-blocking lint warning
