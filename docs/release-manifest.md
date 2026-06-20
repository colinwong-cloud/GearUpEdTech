# Release Manifest

## In-flight preview candidate (not yet released)

- Date (UTC): 2026-06-20
- Branch: `cursor/recover-missing-features-2d42`
- PR URL: https://github.com/colinwong-cloud/GearUpEdTech/pull/92
- Preview URL: https://quiz-deploy-ay3n4n95i-colinwong-clouds-projects.vercel.app
- Preview inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/CuTped3XtxGE9RGLDbBus88mAs8p
- Candidate feature: `F-TUTOR-PORTAL` (導師入口 `/tutor`)
- SQL prerequisites:
  - `supabase_tutor_portal_auth.sql`
  - `supabase_tutor_referral_contact_fields.sql`

## Release identity

- Release date (UTC): 2026-06-20
- Release branch: `cursor/recover-missing-features-2d42`
- PR URL: https://github.com/colinwong-cloud/GearUpEdTech/pull/92
- Preview URL: https://quiz-deploy-bix06wl29-colinwong-clouds-projects.vercel.app
- Preview inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/EUntMgMpqyJAA1ZFnUarLboxS67U
- Planned production source (`main` SHA preferred): `cursor/recover-missing-features-2d42` (temporary recovery rollout)
- Production deployment: `dpl_BpUcdDoH2xE2bwrC1DEuU97YJzEv`

## Included in this release

| Feature ID | Feature | Reason for inclusion | Validation owner |
|---|---|---|---|
| F-REFERRAL-ADMIN-CONTACT | Admin 教師編號維護新增 tutor_mobile(必填) + tutor_email(可選) 並限制一個手機只能有一個啟用碼 | Owner-requested referral contact enhancement | owner + agent |
| F-REFERRAL-SQL | Referral SQL enhancement (`supabase_tutor_referral_contact_fields.sql`) | Required DB migration for contact fields + active mobile uniqueness | owner + agent |

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
- `npm run release:gate`: PASS
- `npm run smoke` or fallback smoke: fallback smoke PASS on production (`/` 200, `/admin` 200, `/api/admin/console` unauthorized 401)

## Gatekeeper approvals

- Owner approval reference: chat approval before production deployment (2026-06-20)
- Gatekeeper agent result: PASS
- Residual risks: SQL migration `supabase_tutor_referral_contact_fields.sql` must be applied in Supabase for full feature activation
