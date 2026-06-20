# Release Manifest Template

Copy this file to `docs/release-manifest.md` for each release.

## Release identity

- Release date (UTC):
- Release branch:
- PR URL:
- Preview URL:
- Preview inspector:
- Planned production source (`main` SHA preferred):

## Included in this release

| Feature ID | Feature | Reason for inclusion | Validation owner |
|---|---|---|---|
| F-EXAMPLE | Example feature | Requested in this release scope | owner |

## Deferred/Parked (explicitly not in this release)

| Feature ID | Feature | Current status | Reason deferred | Next action |
|---|---|---|---|---|
| F-TUTOR-PACKAGE | Tutor package checkout flow | parked | Intentionally paused by owner | Resume when owner says "continue tutor package" |

## Must-not-break verification

Reference: `docs/feature-registry.md` (B1 + B2 packs)

- Critical inventory result:
- B2-0 Test Preconditions:
- B2-1 E2E Entry / Authentication:
- B2-2 Student-side Flow:
- B2-3 Parent-side Flow:
- B2-4 Account Maintenance:
- B2-5 Payment Module:
- B2-6 Admin Console:
- B2-7 Sharing / Tracking / Compliance:

## Validation evidence

- `npm run lint`:
- `npm test`:
- `npm run build`:
- `npm run smoke` or fallback smoke:

## Gatekeeper approvals

- Owner approval reference:
- Gatekeeper agent result: PASS
- Residual risks:
