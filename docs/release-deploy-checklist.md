# Release Deploy Checklist

- [ ] Feature implemented on dedicated `cursor/*-2d42` branch
- [ ] PR created/updated and pushed
- [ ] Preview deployed and shared
- [ ] User approved preview
- [ ] `npm run lint` passed (or known non-blocking warning documented)
- [ ] `npm test` passed
- [ ] `npm run build` passed
- [ ] Must-not-break gates verified:
  - [ ] Student result page readability still correct
  - [ ] Parent practice email readability still correct
  - [ ] Other unrelated approved features not regressed
- [ ] Production deployed from `main`
- [ ] Post-deploy smoke checks passed
- [ ] README + SOP/checklist updated with deployment record

## Latest executed checklist (2026-06-18)

- [x] Feature implemented on dedicated `cursor/*-2d42` branch
- [x] PR created/updated and pushed
- [x] Preview deployed and shared
- [x] User approved preview
- [x] `npm run lint` passed (with documented non-blocking warning)
- [x] `npm test` passed
- [x] `npm run build` passed
- [x] Must-not-break gates verified:
  - [x] Student result page readability still correct
  - [x] Parent practice email readability still correct
  - [x] Other unrelated approved features not regressed
- [x] Production deployed (`dpl_5gdQY3RnoDKF4koSx1LH3DBwSbJQ`)
- [x] Post-deploy smoke checks passed
- [x] README + SOP/checklist updated with deployment record
