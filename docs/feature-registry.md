# Feature Registry (Anti-missing Baseline)

## Purpose

This registry is the machine-readable baseline for "must-retain" features.
It complements release SOP by adding an automated CI gate that fails when
critical feature files or feature markers are missing.

## Source of truth

- Registry data file: `docs/feature-registry.json`
- Validation script: `scripts/feature-retention-check.mjs`
- npm command: `npm run feature:retention`
- Full release gate: `npm run release:gate`

## What the checker enforces

1. Required files must exist (API routes, tutor pages, shared modules).
2. Required feature markers must remain in key files.
   - Example: result page `回到主畫面`, payment history marker `消費紀錄`,
     parent email wrong-question block markers, Admin KPI today registration markers.

## Update workflow (required)

When adding or approving a new production feature:

1. Add/adjust entries in `docs/feature-registry.json`.
2. Run `npm run feature:retention`.
3. Include registry updates in the same PR as the feature.
4. Ensure PR to `main` passes GitHub Action "Release Gate".

## Guardrail policy

- If a feature is intentionally removed or renamed, update this registry in the same PR.
- Do not bypass failing retention checks without explicit business approval.
