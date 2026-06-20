# Release Manifest

## Release identity

- Release date (UTC): 2026-06-20
- Release branch: `cursor/recover-missing-features-2d42`
- PR URL: https://github.com/colinwong-cloud/GearUpEdTech/pull/92
- Preview URL: https://quiz-deploy-ay3n4n95i-colinwong-clouds-projects.vercel.app
- Preview inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/CuTped3XtxGE9RGLDbBus88mAs8p
- Planned production source (`main` SHA preferred): `cursor/recover-missing-features-2d42` (temporary recovery rollout)
- Production deployment: `dpl_G76TyVLc7ccYy9wkC4JSMZqfvbRb`

## Included in this release

| Feature ID | Feature | Reason for inclusion | Validation owner |
|---|---|---|---|
| F-TUTOR-PORTAL | Tutor portal entrance `/tutor` (referral code login + first-login password change + 5-attempt temporary lockout + read-only linked-mobile records) | Owner-requested tutor web entrance built on referral registration | owner + agent |
| F-TUTOR-PORTAL-SQL | Tutor portal auth SQL (`supabase_tutor_portal_auth.sql`) | Required DB migration for tutor account auth, password change flag, and lockout fields | owner + agent |

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
- B2-8 Tutor Portal (new): PASS

## Validation evidence

- `npm run lint`: PASS (existing non-blocking `next/no-img-element` warning only)
- `npm test`: PASS
- `npm run build`: PASS
- `npm run release:gate`: PASS
- `npm run smoke` or fallback smoke: fallback smoke PASS on production (`/` 200, `/admin` 200, `/tutor` 200, `/api/admin/console` unauthorized 401, `/api/tutor/session` unauthorized 401)

## Gatekeeper approvals

- Owner approval reference: chat approval before production deployment (2026-06-20)
- Gatekeeper agent result: PASS
- Residual risks: run both SQL files in Supabase (`supabase_tutor_portal_auth.sql` and `supabase_tutor_referral_contact_fields.sql`) to activate full tutor login + referral contact constraints on DB side
