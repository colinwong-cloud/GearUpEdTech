## Summary

- Change scope:
- Why this change is needed:

## Release Gate (Must-Not-Break) Checklist

> Mandatory: complete this checklist before merge.  
> Any unchecked or failing item must be explained in "Notes / Risks" below.

### 0) Test Preconditions (must prepare)

- [ ] Free parent test account available
- [ ] Paid parent test account available (with payment history)
- [ ] Admin test account available
- [ ] Test student set includes P1-P6 and both genders/avatars/schools
- [ ] Test discount code exists
- [ ] Browser set: Safari + Chrome

### 1) E2E Entry / Authentication

#### Login page (`/`)
- [ ] Top banner/logo renders correctly
- [ ] Marketing text renders correctly
- [ ] "請輸入電話號碼及密碼登入" shown
- [ ] Platform brief block exists
- [ ] FAQ block exists
- [ ] WhatsApp + WeChat share buttons exist
- [ ] Cookie banner/settings entry behavior correct (login page only)

#### Register flow
- [ ] Click "新用戶註冊" enters register screen
- [ ] Privacy statement consent required before submit
- [ ] Register submit works for valid input
- [ ] Register success returns expected next step/login state

#### Login flow
- [ ] Mobile + PIN login success works
- [ ] Invalid login shows proper error
- [ ] Login context created correctly (no pseudo-login)

#### Reset password flow
- [ ] Forgot password page has mobile + email fields
- [ ] Validation works (mobile format / required email)
- [ ] Reset email API sends successfully
- [ ] Reset link page accepts token and resets PIN
- [ ] Return action leads to clean `login_mobile` state

#### Session guard
- [ ] If auth context missing, protected screens auto-redirect to login
- [ ] Logout clears state completely

### 2) Student-side Flow

#### Start practice
- [ ] Role select -> student path works
- [ ] Student selection works
- [ ] Subject selection includes Math / Chinese / English
- [ ] Question count selection works
- [ ] Quiz session starts successfully

#### Question drawing logic
- [ ] Strict AI-only mode active (`source='AI'`)
- [ ] If AI pool insufficient, blocked with correct message
- [ ] If sufficient, quiz proceeds normally

#### Answering behavior
- [ ] MCQ selection/submit behavior correct
- [ ] Short-answer input + submit correct
- [ ] Image/question rendering normal
- [ ] Per-question deduction logic works (free tier)

#### Result screen
- [ ] Score/accuracy values correct
- [ ] Practice summary shown correctly
- [ ] Optional follow-up actions work (next/back/send email etc.)

### 3) Parent-side Flow

#### Parent dashboard
- [ ] Role select -> parent path works
- [ ] Subject selector works
- [ ] Month selector works
- [ ] Session list loads correctly
- [ ] Session detail opens correctly
- [ ] Chart renders correctly
- [ ] Grade-rank section renders by selected subject

#### Tier display
- [ ] Free/Paid tier badge/status correct
- [ ] Paid-until date display correct
- [ ] Upgrade entry visible for free users

### 4) Account Maintenance

#### Account menu and profile
- [ ] Account menu reachable
- [ ] Profile edit save works
- [ ] Student gender/avatar/school edit works
- [ ] Add-student form works (including validation)

#### Balance and transactions
- [ ] Balance view reachable
- [ ] Transactions grouped by date/student correctly
- [ ] Chinese/Math/English transaction labels correct
- [ ] Paid-tier transaction logging appears
- [ ] `balance_after = -1` shown as `Unlimited` correctly

### 5) Payment Module (Airwallex)

#### Checkout
- [ ] Upgrade/payment entry works
- [ ] Terms and conditions acceptance required
- [ ] Discount code validate/apply works
- [ ] Checkout payload generated successfully
- [ ] Locale behavior correct (`zh-HK`)

#### Payment methods safeguard
- [ ] Hosted payment page supports Card / Apple Pay / Google Pay / AlipayHK / WeChat Pay
- [ ] Method safeguard logic test passes (no accidental drop)

#### Post-payment
- [ ] Callback/verify marks paid status correctly
- [ ] Webhook idempotency works (no duplicate processing)
- [ ] Parent tier update reflected in UI
- [ ] Recurring charge cron path remains healthy

### 6) Admin Console (critical)

#### Admin access
- [ ] `/admin` login works
- [ ] All tabs visible (must-have): 業務概覽 / 題目配額 / 學生練習摘要 / 刪除帳戶 / 電郵通知 / 題目管理 / 付款狀態查詢 / 折扣碼維護

#### Tab: 業務概覽
- [ ] Today KPI loads
- [ ] Monthly trend loads
- [ ] Refresh button works
- [ ] Data not polluted by excluded test rules (as intended)

#### Tab: 題目配額
- [ ] Search parent by mobile works
- [ ] Add quota works and refreshes balance

#### Tab: 刪除帳戶
- [ ] Search and delete flow works with confirmation

#### Tab: 電郵通知
- [ ] Setting load/save works

#### Tab: 題目管理
- [ ] Search question works
- [ ] Update question works

#### Tab: 付款狀態查詢
- [ ] Search parent payment status by mobile works
- [ ] Paid detail fields display correctly
- [ ] Cancel future payment works
- [ ] Refund last payment preview works
- [ ] Refund confirm works
- [ ] Monthly paid summary loads
- [ ] Month selector changes summary
- [ ] CSV download works

#### Tab: 折扣碼維護
- [ ] Discount code list loads
- [ ] Create/update/delete works
- [ ] Search/filter works
- [ ] Usage summary loads
- [ ] Usage CSV download works

### 7) Sharing / Tracking / Compliance

#### Social sharing
- [ ] WhatsApp button opens native/share flow correctly
- [ ] WeChat overlay appears with instruction then proceeds
- [ ] WeChat/WhatsApp icons display correctly
- [ ] Share URL and metadata logic correct

#### GTM / GA events
- [ ] `anon_visit` fires
- [ ] `anon_engaged_30s_no_auth` fires
- [ ] `register_start` / `register_submit_attempt` / `register_success` fire
- [ ] `login_attempt` / `login_success` fire
- [ ] Event dedup/session logic works

#### Cookie consent (PCPD)
- [ ] Banner appears on first login-page visit
- [ ] Accept/reject/save preferences work
- [ ] Preferences persist to localStorage
- [ ] Cookie policy modal works in zh-HK + EN
- [ ] Cookie UI does not appear on student practice pages

### 8) API/RPC/SQL Health (release safety)

- [ ] `/api/admin/*` routes return expected data
- [ ] `/api/payment/checkout|verify|webhook` healthy
- [ ] `/api/send-reset-email` healthy
- [ ] `/api/share-events` and `/api/wechat/share-config` healthy
- [ ] Required SQL migrations for recent features already applied in Supabase
- [ ] No NOT NULL/constraint regression in balance/payment flows

### 9) Build + Quality Gate

- [ ] `npm test` pass
- [ ] `npm run lint` pass (or only accepted known warnings)
- [ ] `npm run build` pass
- [ ] Preview smoke test pass
- [ ] Production smoke test pass

### 10) Release sign-off record (for each release)

- [ ] Release ID / commit
- [ ] Tester name
- [ ] Date/time
- [ ] Failures found + fix commits
- [ ] Final approval

## Notes / Risks

- N/A items and reasons:
- Follow-up actions:
