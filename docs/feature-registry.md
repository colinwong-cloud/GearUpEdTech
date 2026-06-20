# Feature Registry

This registry is the permanent source of truth for feature lifecycle status.
It prevents "built but forgotten" regressions by tracking:

- what is released,
- what is approved but not released,
- what is parked,
- what must be verified before each production deploy.

## How to use

1. Every new feature must be added to **B1** when work starts.
2. Every release must update **status**, **branch**, **PR**, and **deploy ID**.
3. Parked work (for example tutor package) must remain visible in this file.
4. Every production deploy must run all **B2** packs and record PASS/FAIL/N/A in `docs/release-manifest.md`.

## Status definitions

- `planned`: approved to build, not started
- `in_dev`: active development in feature branch
- `in_preview`: deployed to preview waiting for owner check
- `approved`: approved in preview, not yet deployed
- `released`: deployed to production
- `parked`: intentionally paused and explicitly not in current release
- `deprecated`: no longer supported, retained only for history

---

## B1. Functional feature records

| Feature ID | Feature | Status | Criticality | Branch | PR | Production deploy | Must-not-break | Notes |
|---|---|---|---|---|---|---|---|---|
| F-LOGIN-REGISTER-CTA | Login standout 新用戶註冊 button | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-PAID-CTA-COPY | Paid-tier invite copy (解鎖無限題目練習) | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-REGISTER-GENDER | Registration gender mandatory | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-REFERRAL-FRONTEND | Registration optional 負責教師編號 + inline errors | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-REFERRAL-ADMIN | Admin 教師編號維護 module | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-REFERRAL-SQL | tutor referral SQL (`supabase_tutor_referral_codes.sql`) | released | normal | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-RESULT-BOTTOM-ACTIONS | Result bottom actions (重新選擇科目 / 返回主畫面) | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-RESULT-READABILITY-STUDENT | Student result readability 4-block format | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-RESULT-READABILITY-PARENT | Parent session detail readability 4-block format | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-EMAIL-READABILITY | Parent email wrong-question detail cards readability | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-PAYMENT-HISTORY | Paid-user 消費紀錄 + year filter | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-ADMIN-PARENT-STUDENT-SUMMARY | Admin 家長學生練習摘要 | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-ADMIN-TODAY-PARENT-KPI | Admin 今日新註冊家長摘要 | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-ADMIN-GRADE-FREQ | Admin grade-level frequency summary (month + subject selector) | released | release-critical | cursor/recover-missing-features-2d42 | #92 | dpl_D3wmAftfzJqjxHfo151fmx2BfVCR | yes | |
| F-TUTOR-PACKAGE | Tutor package checkout flow | parked | release-critical | cursor/tutor-package-flow-2d42 | n/a | not released | yes | Keep explicitly listed as parked until resumed |

---

## B2. Release test packs (must-pass packs)

Record PASS/FAIL/N/A per release in `docs/release-manifest.md`.

### B2-0 Test Preconditions (must prepare)

- Free parent test account available
- Paid parent test account available (with payment history)
- Admin test account available
- Test student set includes P1-P6 and both genders/avatars/schools
- Test discount code exists
- Browser set: Safari + Chrome

### B2-1 E2E Entry / Authentication

- Login page (`/`) renders banner/logo, marketing text, login prompt, platform brief, FAQ
- WhatsApp + WeChat share buttons exist
- Cookie banner/settings behavior correct on login page
- Register flow: 新用戶註冊 entry, privacy consent required, valid submit success
- Login flow: mobile + PIN success, invalid login error, real auth context only
- Reset password flow: validation, send email API, token reset, clean return to `login_mobile`
- Session guard redirects protected screens when auth missing
- Logout clears auth state completely

### B2-2 Student-side Flow

- Role select to student path works
- Student selection works
- Subject selection includes Math / Chinese / English
- Question count select works
- Quiz session starts successfully
- Strict AI-only draw active (`source='AI'`)
- AI insufficient pool blocks with correct message
- AI sufficient pool proceeds normally
- MCQ and short-answer submit behavior correct
- Image and question rendering normal
- Free-tier per-question deduction works
- Result screen score/accuracy/summary correct
- Optional follow-up actions work

### B2-3 Parent-side Flow

- Role select to parent path works
- Subject selector works
- Month selector works
- Session list and detail open correctly
- Charts render correctly
- Grade-rank follows selected subject
- Tier badge/status correct
- Paid-until display correct
- Upgrade entry visible for free users

### B2-4 Account Maintenance

- Account menu reachable
- Profile edit save works
- Student gender/avatar/school edit works
- Add-student validation + submit works
- Balance view reachable
- Transactions grouped by date/student correctly
- Chinese/Math/English labels correct
- Paid-tier transaction logging appears
- `balance_after = -1` shown as Unlimited

### B2-5 Payment Module (Airwallex)

- Checkout entry works
- Terms acceptance required
- Discount validate/apply works
- Checkout payload generated
- Locale `zh-HK` correct
- Payment methods available: Card / Apple Pay / Google Pay / AlipayHK / WeChat Pay
- Method safeguard logic prevents accidental method drop
- Callback/verify updates paid status correctly
- Webhook idempotency works (no duplicate processing)
- Parent tier update reflected in UI
- Recurring charge cron remains healthy

### B2-6 Admin Console (critical)

- `/admin` login works
- Required tabs visible: 業務概覽 / 題目配額 / 刪除帳戶 / 電郵通知 / 題目管理 / 付款狀態查詢 / 折扣碼維護
- 業務概覽: Today KPI, monthly trend, refresh, test-data exclusion behavior
- 題目配額: search by mobile, add quota refreshes balance
- 刪除帳戶: search + delete with confirmation
- 電郵通知: load/save works
- 題目管理: search + update question works
- 付款狀態查詢: search, paid details, cancel future payment, refund preview/confirm, monthly summary, month switch, CSV download
- 折扣碼維護: list, create/update/delete, search/filter, usage summary, CSV download

### B2-7 Sharing / Tracking / Compliance

- WhatsApp share button opens native/share flow correctly
- WeChat overlay behavior and instruction flow correct
- WeChat/WhatsApp icons display correctly
- Share URL and metadata behavior correct
- GTM / GA event checks pass for defined release events
