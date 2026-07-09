# Feature Contract (Apr 2026 onward)

This document defines the anti-missing framework as **enforceable release policy**.

Source of truth:

- `docs/feature-contract.json` (machine-readable contract + full commit inventory since `2026-04-01`)
- `scripts/feature-contract-check.mjs` (fails release when contract or checks drift)
- `scripts/payment-priority-check.mjs` (hard gate for payment module)
- `.github/workflows/release-gate.yml` (CI enforcement on PR/push to `main`)

## Contract guarantees

1. **Apr-2026 day-one coverage baseline**
   - Contract includes full non-merge commit inventory from `2026-04-01` onward.
   - Gate fails if any commit in that range is missing from the inventory.

2. **Feature retention checks**
   - Every feature row has concrete checks (`file_exists`, `file_contains`).
   - Gate fails if any check no longer passes.

3. **Payment module priority**
   - Payment-critical feature rows are mandatory.
   - Dedicated payment gate validates recurring checkout, verify/webhook finalization, recurring cron, admin payment tools, and payment safeguards.

4. **No product change without contract update**
   - If product files (`src/**`, `supabase_*.sql`, `vercel.json`, `package.json`) change but `docs/feature-contract.json` does not, the gate fails.

## Release commands

```bash
npm run feature:contract:refresh
npm run release:gate
```

## CI required checks

- `feature:contract`
- `payment:priority`
- `feature:retention`
- `test`
- `lint`
- `build`

