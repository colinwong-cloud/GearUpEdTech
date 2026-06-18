# Release SOP

## Goal

Prevent regression by requiring one release source, mandatory validation, and explicit feature gate checks for every production deployment.

## Source of truth

1. Preview must be built from a feature branch.
2. Production deployment must be from merged `main` commit SHA.
3. Every release must include README release notes + SOP/checklist update.

## Mandatory validation gates

Run all before production:

1. `npm run lint`
2. `npm test`
3. `npm run build`
4. Manual feature checks on preview for changed module(s)

## Must-not-break feature gates (current)

1. Student result page readability:
   - Wrong-answer blocks show: question content, student answer with value, correct answer with value, explanation.
2. Parent practice email readability:
   - Email includes readable wrong-question detail cards with answer values.
3. Tutor package checkout (currently parked in preview branch):
   - Resume only when user sends `continue tutor package`.

## Deployment steps

1. Implement on feature branch.
2. Commit + push.
3. Open/update PR.
4. Validate with mandatory gates.
5. Deploy preview and get approval.
6. Merge to `main`.
7. Deploy `main` to production.
8. Run smoke checks on production.
9. Record deployment in README + release SOP/checklist.
