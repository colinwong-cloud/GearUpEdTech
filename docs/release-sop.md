# Release SOP v2 (Hybrid Permanent Gatekeeping)

This SOP is the permanent anti-regression release protocol.  
It combines:

1. branch discipline,
2. in-repo feature registry,
3. explicit release manifest (included + deferred),
4. human + gatekeeper approval,
5. machine-enforced checks.

## 1) Branch model (permanent)

- `main`: only long-term release source of truth
- `cursor/*-2d42` or `feature/*`: active development
- `parked/*` (or dedicated feature branch with parked status in registry): approved but intentionally paused work
- optional `release/*`: bundled release stabilization branch

**Rule:** production deploy should come from merged `main` SHA.  
If emergency exception happens, back-merge into `main` immediately and re-baseline release records.

## 2) Mandatory artifacts before production

Each release must update:

1. `docs/feature-registry.md`
2. `docs/release-manifest.md` (from `docs/release-manifest-template.md`)
3. `docs/release-deploy-checklist.md`
4. `README.md` latest deploy + changelog

## 3) Feature registry lifecycle governance

Feature lifecycle statuses are managed in `docs/feature-registry.md`:

- planned -> in_dev -> in_preview -> approved -> released
- parked (explicitly deferred)
- deprecated

Every feature must have:

- unique Feature ID
- status
- branch/PR/deploy trace
- must-not-break flag

This prevents loss of "developed but not yet deployed" features.

## 4) Release manifest gate (included vs deferred)

`docs/release-manifest.md` is mandatory and must contain:

1. Included in this release
2. Deferred/Parked (explicitly not in this release)
3. Must-not-break verification (B1/B2 packs)
4. Validation evidence
5. Gatekeeper approvals

No production deployment should proceed without explicit deferred list.

## 5) Two-layer approval gate

Production release requires both:

1. **Owner approval** in chat
2. **Gatekeeper agent result: PASS** in release manifest

Agent review is mandatory but does not replace owner decision.

## 6) Validation gates

Run and record for each release:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. `npm run smoke` if script exists
5. if no smoke script, fallback smoke:
   - `GET /` returns 200
   - `GET /admin` returns 200
   - `POST /api/admin/console` without auth returns 401

## 7) Automation enforcement

Run release gate script:

- `npm run release:gate`

The script validates required files/sections for registry + manifest + checklist.

Recommended CI policy:

- PRs to main must pass `release:gate` before merge.

## 8) Critical feature registry

Must-not-break inventory and B2 test packs are maintained in:

- `docs/feature-registry.md`

Use this file as canonical test scope, not memory.

## 9) Release record discipline

After each production deploy:

1. Update `README.md` latest deployment metadata.
2. Append changelog entry.
3. Update latest executed checklist entry.
4. Update latest deployment record here.

## 10) Latest deployment record

- Date (UTC): 2026-06-20
- Deployment ID: `dpl_BpUcdDoH2xE2bwrC1DEuU97YJzEv`
- Production URL: https://q.hkedutech.com
- Inspector: https://vercel.com/colinwong-clouds-projects/quiz-deploy/BpUcdDoH2xE2bwrC1DEuU97YJzEv
- Scope:
  - release tutor referral admin contact enhancement (`tutor_mobile` required + `tutor_email` optional)
  - enforce one active referral code per tutor mobile via DB unique partial index
  - add migration file `supabase_tutor_referral_contact_fields.sql` and usage snapshot columns
- Validation:
  - `npm run lint` (pass with existing non-blocking `next/no-img-element` warning)
  - `npm test` (pass)
  - `npm run build` (pass)
  - `npm run release:gate` (pass)
  - fallback smoke checks on production: `/` 200, `/admin` 200, `/api/admin/console` unauthorized 401
