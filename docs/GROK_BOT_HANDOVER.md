# GearUp Quiz handover for Grok Bot

Date: 2026-10-15
Repo: `colinwong-cloud/GearUpEdTech`
`origin/main` at handover: `77dd7c3` (merge of PR #212, company name in the HKSTP note)
Owner-facing site: https://www.gearupquiz.com
Tutor page: https://www.gearupquiz.com/tutor
Vercel project: `quiz-deploy` (`prj_axozCwaJhjd4OcoGVkL1TJQufdKu`), team `colinwong-clouds-projects`
README also records the alias https://q.hkedutech.com on the same Vercel project. Treat www.gearupquiz.com as the site the owner reviews.

Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind, Supabase, Airwallex Hosted Payment Page, Vitest, Playwright, ESLint.

Product copy is Traditional Chinese. Keep the owner’s Chinese strings exact.

---

## Must do before any edit

1. `git fetch origin main`
2. Create a **new** branch from `origin/main`. Never continue an old local branch.
3. Branch name: `cursor/<lowercase-description>-2d42`
4. Pull requests target `main`. Leave them draft until the owner asks to mark them ready. The owner merges. Do not merge design or payment work on your own.
5. The workspace may be sitting on a stale branch such as `cursor/grouped-balance-history-2d42`. That branch is not `main`. Discard it as a starting point.

```bash
git fetch origin main
git checkout -b cursor/<task>-2d42 origin/main
```

Preview before production. Share the Vercel preview URL. Wait for the owner’s explicit approval before any production deploy. Preview URLs often return HTTP 302 to Vercel SSO; that is login, not a failed deploy.

---

## Release gate (every product change)

CI on `main` and on pull requests runs:

- `npm test` (Vitest)
- `npm run lint`
- `npm run build`
- `npm run smoke` (Playwright)
- `npm run feature:contract`
- `npm run payment:priority`
- `npm run feature:retention`

`docs/feature-contract.json` is the inventory of commits since 2026-04-01 plus file checks. If you change `src/**`, `supabase_*.sql`, `vercel.json`, or `package.json`:

1. Add or tighten a check in `scripts/feature-contract-source.mjs` when the change is a behavior the owner cares about.
2. Commit the product change first.
3. Run `npm run feature:contract:refresh`.
4. Commit **only** `docs/feature-contract.json`.
5. Run `npm run feature:contract` and expect it to pass.

The gate allows the current HEAD commit to be missing from the inventory. It also allows a commit that touches only `docs/feature-contract.json`. Any older commit that is missing fails the gate. Refreshing the contract **before** the feature commit does not include that commit.

When a regression is fixed, also add a guard in `src/lib/anti-missing-regressions.test.ts` if the behavior is user-visible.

`react-hooks/set-state-in-effect` is an ESLint error. Do not call `setState` synchronously inside `useEffect`.

---

## Secrets and SQL

- Build Supabase storage URLs from `process.env.NEXT_PUBLIC_SUPABASE_URL`. A committed literal of that env var fails the secret scan.
- `SUPABASE_SERVICE_ROLE_KEY`, Airwallex keys, admin passwords, and `CRON_SECRET` are Vercel secrets. Do not print them. Do not commit them.
- SQL files `supabase_*.sql` are applied by the owner in the Supabase SQL editor. They are not auto-migrated. Add a new SQL file only when the schema must change, and say so in the PR. Do not run SQL against production as part of a UI task.
- Test mobiles starting with `9999` are excluded from live KPI. Do not “clean up” those filters. `91917838` is a real parent account used for ranking seeds. Do not re-run its seed SQL.

Local dev when a browser check is required:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3010
```

Only one `next dev` can run in this directory. Playwright on this environment uses `/usr/bin/google-chrome` with `--no-sandbox`. A screenshot of the changed screen is not enough; exercise the flow.

---

## Map of the product

| Who | URL | Main code |
| --- | --- | --- |
| Parent + student | `/` | `src/app/page.tsx` (one client app, many screens) |
| Tutor | `/tutor`, `/tutor/student/[hash]` | `src/app/tutor/page.tsx`, `tutor-login-marketing.tsx` |
| Admin | `/admin` | `src/app/admin/page.tsx`, `src/app/api/admin/console/route.ts` |
| Airwallex sheet | `/payment-airwallex` | `src/app/payment-airwallex/page.tsx` |
| Payment return | `/payment-callback` | `src/app/payment-callback/page.tsx` |
| Password reset | `/reset-password` | `src/app/reset-password/page.tsx` |
| Merchant invoices | `/mer` | `src/app/mer/page.tsx` (internal vendor billing, not parent/tutor checkout) |

Parent plan price: **HK$99 / month** (`PRICE_HKD` in `src/app/api/payment/checkout/route.ts`).
Tutor plan price: **HK$199 / month** (`TUTOR_PLAN_PRICE_HKD` in `src/lib/tutor-billing.ts`).

Support email on login and tutor pages: `cs@gearupquiz.com`.

---

## Student and parent (`src/app/page.tsx`)

One file owns the public app. Screens are `setScreen(...)` values:

- `login_mobile` — phone + PIN. Copy includes 「請輸入電話號碼及密碼登入」.
- `register` — 「新用戶註冊」. Gender is required. Privacy consent is required. Optional `負責教師編號` is 6 digits. Invalid code shows 「錯誤編號」. Exhausted code shows 「編號被限，請負責老師聯絡管理員更新編號。」 Errors stay under the referral field and must not wipe the form.
- `forgot_password` then `/reset-password`.
- `login_role` — student vs parent.
- Student: `login_student` → `subject_select` (Math / Chinese / English) → `question_count_select` (`10`, `20`, `30`) → `quiz` → `results`.
- Parent: `parent_student_select` → `parent_dashboard` → `parent_session_detail`.
- Account: `account_menu`, `profile_edit`, `add_student_form`, `balance_view`, `payment_history`, `payment`.

Quiz rules that must stay:

- Questions are strict AI-only (`source='AI'`). If the pool is short, block with the existing message. Do not fall back to non-AI rows.
- Free tier deducts from a **shared** question pool across subjects. Paid tier shows unlimited (`balance_after = -1` displays as Unlimited).
- Result page keeps 「錯題解析」, student answer with value, correct answer with value, explanation, 「再做一次」, and 「回到主畫面」. Home from results goes to `login_role`, not a broken redirect.
- Question report email does not CC the parent. Route: `POST /api/send-question-report`.
- Practice summary is rule-based Traditional Chinese, about 50–80 characters, stored on `quiz_sessions`. It is not an LLM call.
- Parent report order: subject switch, then same-subject grade rank, then month and charts. Rank includes students with at least 100 completed questions in that subject. Score is the average of the last 10 session accuracies.
- Cookie banner is for the login page. It must stay off the practice screens.
- Copy on the page is allowed. Quiz question content still blocks context menu and clipboard where `preventContextMenu` / `preventQuizClipboard` are wired.

Login marketing, already on `main`:

- `MainPagePartnerLogos` in `src/components/main-page-banner-carousel.tsx`: GearUp EduTech on the left, aquamarine HKSTP Partner on the right, equal visual height, gap about the Innovation Pin width, HKSTP width at least 100px, transparent background. Assets: `public/main/gearup-quiz-logo.webp`, `public/main/hkstp-partner-aquamarine.png`.
- Banner carousel uses banners `0, 1, 3, 4, 5, 6` (there is no banner 2): `/main/main-page-banner-${n}.webp`.
- Above 「平台簡介」, a separate card titled **創新理念獲肯定**. Body says **GearUp EduTech Limited** was approved as an HKSTP partner in October 2026 (「於2026年10月正式獲批成為 HKSTP 合作夥伴」). The three reading blocks under 平台簡介 stay: 全方位混合學習模式, AI 智能精準輔導, 100% 貼合香港教育局課程. Weekly-test wording stays 「備考週測」.

---

## Tutor portal

Public logged-out page `/tutor`:

- Same `MainPagePartnerLogos` row, then the tutor carousel (`public/tutor/20261005-tutor-1.webp` … `7.webp`).
- Partnership card first, title **創新理念獲肯定**, then the existing 「平台簡介」 paragraph. Company name is GearUp EduTech Limited, dated October 2026. Same sentence as the homepage.
- Intro text starts 「增分寶 GearUp Quiz 導師平台專為香港私人補習導師而設」.
- FAQ is fetched at runtime from Supabase storage `Webpage_images/tutor/tutor_portal_FAQ_261005.txt` via `tutorFaqUrl()` in `src/app/tutor/tutor-login-marketing.tsx`. The owner can replace that txt without a code change. Carousel images are committed files; replacing art needs a commit.
- Footer: `© 2026 GearUp EduTech Limited`.
- Password help: mailto `cs@gearupquiz.com`, not 「聯絡管理員」.
- 「新登記導師」 is self-registration (`POST /api/tutor/register`) with Turnstile. Admin later sets the initial password. First login forces a password change.
- 「導師登入」 then the signed-in overview. 「返回主頁」 goes to `/`.

Signed-in tutor:

- Student list, sorted for recent practice. Opening a student goes to `/tutor/student/[hash]`.
- Student page: practice charts, wrong-answer detail, school comparison (paid sample vs real data), offline practice papers (student paper and answer paper PDFs).
- Practice-paper quota: free tier is 4 papers per month; paid tutor plan is unlimited. Filename and CJK PDF layout are already tuned. Do not regress the PDF font path `src/lib/server/assets/NotoSansTC-subset.ttf`.
- Share link for parents to register with the tutor code: `TutorShareLink`.

Tutor billing:

- Checkout: `POST /api/tutor/billing/checkout` returns the PaymentIntent plus `recurring_terms_of_use`.
- `src/lib/tutor-plan-checkout.ts` stores those terms in `sessionStorage` under `tutor-checkout-terms:<intentId>` and opens `/payment-airwallex?...&payer=tutor`.
- The tutor payment page must send the **same** terms object the intent was created with, including `billing_cycle_charge_day` and `total_billing_cycles: null`. A shorter object is why tutor Apple Pay failed while parent Apple Pay worked.
- Confirm return: `POST /api/tutor/billing/confirm`.
- Status: `GET /api/tutor/billing`.

---

## Admin (`/admin`)

Login is `ADMIN_CONSOLE_USER` / `ADMIN_CONSOLE_PASS` (Vercel secrets), session via `POST /api/admin/session`.

Tabs that must remain:

1. 業務概覽 — today KPI, monthly trend, parent/student counts. Excludes `9999` test mobiles.
2. 題目配額 — search parent by mobile, add shared-pool quota.
3. 學生練習摘要
4. 付款狀態查詢 — search by mobile, paid-until, cancel future MIT, refund last payment, monthly paid summary, CSV.
5. 刪除帳戶
6. 電郵通知
7. 題目管理
8. 折扣碼維護
9. 教師編號維護 — create code, usage, parent paid flag, CSV/PDF. Part 3 resets that tutor’s password to `123456`, clears lockout, and sets `must_change_password`.
10. 教師付款情況 — enquiry shows 「每月 HKD」 and an order table (time, amount, status, method). MIT trend counts `tutor-renew-*` orders. The first checkout order id looks like `tutor-<code>-<timestamp>` and shows in search, not in the renew trend.

KPI cron data comes from `GET /api/cron-recalculate-averages?part=rank` at 00:00 UTC and `?part=grade` at 00:02 UTC. Both need `Authorization: Bearer $CRON_SECRET`. Long ranking SQL needs `SUPABASE_SERVICE_ROLE_KEY`. `maxDuration` is 300. If a new SQL file is required, the owner runs it in Supabase. Known hotfix files are listed in `README.md` under grade ranking.

---

## MIT and payments (do not weaken)

Airwallex is production by default. Hosted payment page methods: card, Apple Pay, Google Pay, AlipayHK, WeChat Pay. Method lists live in `src/lib/airwallex-checkout-methods.ts`. Do not drop a method to “simplify” a bug.

### Routes

| Route | Role |
| --- | --- |
| `POST /api/payment/checkout` | Parent HK$99 intent + MIT consent terms |
| `POST /api/payment/verify` | Return-path finalize |
| `POST /api/payment/webhook` | Airwallex webhook, idempotent |
| `GET /api/payment/history` | Parent payment history |
| `GET /api/cron-recurring-payments` | Daily MIT. **GET only.** POST is 405. Bearer `CRON_SECRET`. |
| `POST /api/tutor/billing/checkout` | Tutor HK$199 intent |
| `POST /api/tutor/billing/confirm` | Tutor return confirm |
| `GET /api/tutor/billing` | Tutor plan status |

Cron schedule in `vercel.json` (UTC):

- `10 0 * * *` → 08:10 Hong Kong
- `20 1 * * *` → 09:20 Hong Kong

The cron charges **parents first**, then tutors (`chargeDueTutorPlans` at the end of `src/app/api/cron-recurring-payments/route.ts`). Never call this route to “see what would happen”. It creates real charges.

### Consent shape

`src/lib/airwallex-hpp-mit.ts`

- `next_triggered_by: "merchant"`
- `merchant_trigger_reason: "scheduled"`
- Terms: FIXED amount, HKD, period 1 MONTH, `billing_cycle_charge_day` = today’s UTC date (tutor checkout uses `Math.min(utcDate, 28)` only as a page fallback), `total_billing_cycles: null`
- HPP: `mode: "recurring"`, customer id, and the consent object. Server-side intent consent alone is not enough.

### Apple Pay (hard rule)

`redirectToCheckout` does `JSON.stringify` on the options. A `Date` becomes a string and Apple Pay shows 「輸入無效」. `buildApplePaySubscribeRequestOptions` must stay free of Date fields. Do not send `recurringPaymentStartDate`. The line amount is today’s charge. The label is ASCII `GearUp monthly plan`. The next monthly date is stored on the server with `nextMonthlyRecurringStartDate` (UTC month + 1). It is not sent on the Apple Pay sheet.

### Who gets charged

Eligibility is `src/lib/server/recurring-mit-cron.ts`:

- Status `active`, or `failed` with a retryable error. `paused` and `cancelled` are skipped.
- `next_charge_at <= now`
- Skip when `last_charged_at` is already on or after `next_charge_at` (already charged this stored cycle).
- A 20-minute lease (`mitChargeLeaseIso`) stops the 08:10 and 09:20 runs from double-charging the same cycle.
- Parent confirm tries the shapes in `src/lib/server/recurring-mit-confirm.ts`. Tutor confirm must require a VERIFIED consent and use the same lease plus the same confirm attempts. Do not go back to “first attempt only”.

### Known billing behavior (open, as of 2026-10-10)

After a successful MIT, `next_charge_at` is **previous `next_charge_at` + 1 UTC month**, not `last_charged_at` + 1 month. A charge that succeeds late still keeps the original anniversary. The next run can charge again less than a month after that late success. Parent `91917838` was charged on the morning of 2026-10-10 for this reason. Do not “fix” it by calling the cron. Any fix must:

- keep one charge per cycle (the lease stays)
- set the following due time at least one month after the successful charge time
- cover both `parent_recurring_profiles` and `tutor_recurring_profiles`
- keep Apple Pay free of Date fields
- add a unit test next to `src/lib/server/recurring-mit-cron.test.ts`

`finalizePaymentByIntent` also upserts `next_charge_at` to now + 1 month. The cron’s later write of “old due + 1 month” overwrites that. Read both writes before changing either (`src/lib/server/payment-finalize.ts` and the cron route).

Admin display: parent enquiry shows recurring amount, `next_charge_at`, and orders. Tutor enquiry shows 「每月 HKD」 and the order table. A successful first checkout and the later `tutor-renew-*` / `GU-R-*` renewals are different order ids.

---

## Merchant module (separate)

`/mer` is GearUp’s own vendor invoices (HK format, NET terms, cash, cheque, bank transfer, stamp, email preview). It does not charge parents or tutors. Leave it alone unless the task says merchant / invoice.

---

## What just shipped on `main` (do not rebuild)

- PR #207: homepage HKSTP + GearUp logo row, transparent background. Merged.
- PR #208: same logo row on `/tutor`. Merged.
- PR #209–#211: homepage brief, then the partnership card pulled out above 平台簡介, matching the tutor title treatment. Merged.
- PR #210: tutor page partnership card above 平台簡介, title 創新理念獲肯定. Merged.
- PR #212: both pages say GearUp EduTech Limited in that sentence. Merged. `origin/main` is this merge.

Older merged work that is easy to break: tutor self-registration, tutor practice-paper PDFs, tutor Apple Pay terms parity with the parent intent, tutor MIT cron aligned with the parent cron, admin tutor payment table, shared quota pool, result-page home button, parent email readability.

---

## How to verify a change

1. Branch from `origin/main`.
2. Implement. Update `scripts/feature-contract-source.mjs` if a string or route must not disappear.
3. Commit the feature. Refresh and commit `docs/feature-contract.json`. Push with `git push -u origin cursor/<task>-2d42`.
4. Open a draft PR into `main`.
5. For UI: run the page on port 3010 and click the real path (login, `/tutor`, or `/admin`), including empty and error states the change touches.
6. For payments: unit tests around `airwallex-hpp-mit`, `recurring-mit-cron`, `recurring-mit-confirm`, and `payment-finalize`. Do not hit production cron. Do not put a Date in Apple Pay options.
7. Wait for CI: test, gate, lint, build, smoke, Vercel.
8. Give the owner the PR URL and the preview URL. Stop there until they approve.

Local commands:

```bash
npm test
npm run lint
npm run feature:contract
npm run payment:priority
```

`npm run build` and `npm run smoke` match CI when the change is more than copy.
