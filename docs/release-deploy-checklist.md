# Release Deploy Checklist

Reference SOP: `docs/release-sop.md`

## A) Pre-deploy validation

- [ ] `npm test` passed
- [ ] `npm run lint` passed (or accepted known warning only)
- [ ] `npm run build` passed
- [ ] `npm run smoke` passed (or rerun after env/tooling fix)

## B) Preview gate

- [ ] Preview deployed
- [ ] Preview URL shared
- [ ] Owner explicit approval received

## C) Production gate

- [ ] Production deployed
- [ ] `GET /` = 200
- [ ] `GET /admin` = expected response
- [ ] Unauthorized admin API requests still return 401

## D) Must-not-break feature checks

- [ ] Register CTA still prominent
- [ ] Registration gender required still enforced
- [ ] Result-page wrong-answer detail format still complete/readable
- [ ] Admin key modules still render

## E) Release record

- [ ] README latest deploy updated
- [ ] README changelog updated
- [ ] README handover note updated
