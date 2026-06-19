# Release Deploy Checklist

Reference SOP: `docs/release-sop.md`

## A. Release identity

- [ ] Feature branch identified (`cursor/*-2d42`)
- [ ] Preview URL and inspector URL recorded
- [ ] Target production commit/deploy source recorded

## B. Validation gate

- [ ] `npm run lint` passed (or only accepted existing warnings)
- [ ] `npm test` passed
- [ ] `npm run build` passed
- [ ] `npm run smoke` passed
- [ ] If no smoke script, fallback smoke executed:
  - [ ] `GET /` = 200
  - [ ] `GET /admin` = 200
  - [ ] `POST /api/admin/console` without auth = 401

## C. Must-not-break feature checks

- [ ] Login page shows standout **新用戶註冊**
- [ ] Paid-tier CTA copy is updated to include **解鎖無限題目練習**
- [ ] Registration **性別** is mandatory
- [ ] Registration optional **負責教師編號** + two inline errors still work
- [ ] Admin has **教師編號維護** (create/summary/detail with paid/free status)
- [ ] Admin has **家長學生練習摘要** and **今日新註冊家長摘要**
- [ ] Admin grade-frequency summary has month + subject selector
- [ ] Result page has **重新選擇科目** + **返回主畫面**
- [ ] Result wrong-answer readability block format is intact
- [ ] Parent session detail uses same readability format
- [ ] Parent practice email includes wrong-question readability detail cards
- [ ] Paid-user **消費紀錄** (year filter + date/amount/method) is intact

## D. Production deploy gate

- [ ] Preview approved in chat
- [ ] Production deploy executed
- [ ] Post-deploy smoke checks completed
- [ ] README latest deploy + changelog updated
- [ ] SOP/checklist updated if release gates changed

## Latest executed checklist (2026-06-19)

- [x] Feature branch identified (`cursor/recover-missing-features-2d42`)
- [x] Preview approved in chat
- [x] `npm run lint` passed (existing non-blocking warning only)
- [x] `npm test` passed
- [x] `npm run build` passed
- [x] `npm run smoke` not available, fallback smoke used
- [x] Fallback smoke passed on production (`/` 200, `/admin` 200, `/api/admin/console` 401)
- [x] Production deploy executed (`dpl_D3wmAftfzJqjxHfo151fmx2BfVCR`)
- [x] README + SOP/checklist updated
