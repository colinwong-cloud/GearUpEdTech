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
