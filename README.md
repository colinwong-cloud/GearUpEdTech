# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## 練習小結（每節測驗後）

- **內容**：完成一節練習後，系統根據各題 `question_type` 正確率產生 **約 50–80 字** **繁體**小結（鼓勵語氣、含強項、弱項與**生活化**建議）。**目前不呼叫 LLM**（純規則）；要更口語可接 OpenAI 等，仍寫入同欄位。  
- **顯示**：學生結果頁在**整體正確率區塊下方**，小香蕉**對話泡泡**內。  
- **儲存**：`quiz_sessions.session_practice_summary`（學生向）、`session_practice_summary_parent`（老師視角給家長）；RPC `save_session_practice_summaries(p_session_id, p_student_id, p_student_summary, p_parent_summary)`。  
- **電郵**：`get_quiz_email_data` 含 **`session_practice_summary_parent`**（電郵正文）；完成練習時 Body 可傳 **`session_summary_parent`** 作後備。  
- **Supabase**：執行 `supabase_session_practice_summary.sql`（欄位 + 函數 + 更新 `get_quiz_email_data`）。  
- **測試**：`npm test`；手動清單見 `test_plan_practice_session_summary.md`。

## Parent dashboard: 同級排名

- **位置**：家長「練習報告」內容區**由上而下**為：① **科目**切換（`Math`／`Chinese`／`English`）→ ② **同級排名**（`ParentGradeRankPanel`，**隨科目**：與列表／圖表同一 `p_subject`）→ ③ **月份**導航與列表／圖表。純前端順序；**排名改為按科目**需執行 `supabase_grade_ranking_per_subject.sql` 並重跑 `recalculate_student_grade_rankings()`。
- **邏輯**（批次：`recalculate_student_grade_rankings()`；讀取：`get_parent_student_grade_rank(p_student_id, p_subject)`）  
  - `student_grade_rankings` 每列含 **`subject`**（`Math`／`Chinese`／`English`…）；`Math` 統計含 `quiz_sessions.subject` 為 `Math` 或 **`數學`**。  
  - 只納入 **該科目**累積完成至少 **100 題**（`sum(questions_attempted)`，僅 `questions_attempted > 0` 的次數）的同級學生。  
  - 分數＝該科目 **最近 10 次**練習的「每次正確率」之**平均**。  
  - 以該分數在同期 **`grade_level` + `subject`** 內用 **RANK** 排名。  
- **更新**：Vercel Cron（`vercel.json` → `/api/cron-recalculate-averages`）先 `recalculate_student_grade_rankings()`，再 `recalculate_grade_averages()`。
- **讀取**：`get_parent_student_grade_rank(p_student_id, p_subject)` — 前端與 `get_parent_sessions` / `get_student_chart_data` 傳**相同**科目鍵。
- **佈署**：在 Supabase 執行 **`supabase_grade_ranking_per_subject.sql`**（會清空舊排名表並改 schema），然後手動或等 cron 執行 `recalculate_student_grade_rankings()`。若 `GRANT` 失敗，再執行 `supabase_grade_cron_delete_and_grants.sql` 內相關 `GRANT`（或於該檔補上 `get_parent_student_grade_rank(uuid, text)`）。
- **如批次／cron 出現** `DELETE requires a WHERE clause`：在 Supabase 執行 `supabase_fix_batch_delete_require_where.sql`（將 `DELETE FROM …` 改為 `DELETE FROM … WHERE true`）。  
- **如出現** `canceling statement due to statement timeout`：資料量較大時，原先排名批次對每位學生子查詢掃表會過慢；請在 Supabase 執行 `supabase_optimize_ranking_batch_performance.sql`（加索引、改寫成集合式查詢，並在函數內 `SET LOCAL statement_timeout = '5min'`）。Vercel 路由 `/api/cron-recalculate-averages` 已設 `maxDuration = 300`（秒），需重新部署才生效。  
- **如仍超時**（兩道 RPC 各跑一輪仍觸及 PostgREST 單次請求上限）：每日批次已拆成兩個 Vercel Cron——`?part=rank`（0:00 UTC）與 `?part=grade`（0:02 UTC），見 `vercel.json`。（可選）在 Vercel 專案加入 `SUPABASE_SERVICE_ROLE_KEY` 讓 API 以 service role 呼叫 RPC。依序執行：`supabase_optimize_grade_averages_batch.sql` → `supabase_split_grade_averages_cron.sql` → `supabase_grade_averages_two_step_per_grade.sql`；若**單一年級的「全部題型」**仍超時，執行 `supabase_grade_by_question_type_fine.sql`；若 `?part=grade` 仍失敗，再執行 `supabase_grade_cron_v2_query_plans.sql`（索引＋從 `students`／`questions` 驅動的 `overall` / `one_type`）；務必在 Vercel 設定 `SUPABASE_SERVICE_ROLE_KEY`（僅專案密鑰，勿入庫）。  
- **測試**：見 `test_plan_grade_ranking.md`。
- **最後一併執行** `supabase_grade_cron_delete_and_grants.sql`：新增 `delete_grade_averages_for_grade(grade_level)`，並補齊 `GRANT EXECUTE` 給 cron 會呼叫的函數。API 在 fallback 到 `recalculate_grade_by_type_for_grade` 前可刪除該年級列，避免 unique 衝突。  

### Nightly batch

- Vercel env: `CRON_SECRET` (bearer for `/api/cron-recalculate-averages`), `SUPABASE_SERVICE_ROLE_KEY` (strongly recommended for long RPCs). Rotate `CRON_SECRET` immediately if previously exposed.
- Recommended SQL order for chart/rank recalc: `…optimize_grade…` → `…split…` → `…two_step…` → `…by_question_type_fine…` → `supabase_grade_cron_v2_query_plans.sql` → `supabase_grade_cron_delete_and_grants.sql`.
- Response includes `use_service_role: true` when the service key is set.

## Deployment

The app is deployed on Vercel (custom domain **q.hkedutech.com**; Vercel project `quiz-deploy` under scope `colinwong-clouds-projects`).

**Production URL:** https://q.hkedutech.com

Link once: `vercel link` (scope `colinwong-clouds-projects`, project `quiz-deploy`). Ship to production: `npx vercel deploy --prod`.

**PWA / icons:** `src/app/apple-icon.png` serves `/apple-touch-icon` (iOS “Add to Home Screen”); `src/app/icon.png` is the favicon. Both use the banana mascot artwork.

**Latest production deploy:** **2026-04-29** — deployment `dpl_6AAcK8KowLhaQoLrx7WKPKPRpETj`, alias **Ready** at https://q.hkedutech.com (inspect: https://vercel.com/colinwong-clouds-projects/quiz-deploy/6AAcK8KowLhaQoLrx7WKPKPRpETj). **Supabase:** `supabase_grade_ranking_per_subject.sql` + `recalculate_student_grade_rankings()` for per-subject rank; **English 30-session seed:** `supabase_seed_english_30_sessions_91917838.sql`.

## Changelog (recent)

| Date (approx) | Change |
|----------------|--------|
| 2026-04 | **測試數據（英文 30 節）**：`supabase_seed_english_30_sessions_91917838.sql` — 手機 **91917838**、**Loklok/Heihei** 各 30 節 **English**、每節 10 題、正確率 **20–100%**（`session_token` 前綴 `gearup_seed_english_30-`）。計劃：`test_plan_seed_english_30_sessions_91917838.md`。 |
| 2026-04 | **同級排名按科目**：`student_grade_rankings.subject`；`recalculate_student_grade_rankings()` 按科目分桶；`get_parent_student_grade_rank(uuid, text)` 與家長科目分頁一致。SQL：`supabase_grade_ranking_per_subject.sql`（會清空排名表）；執行後請跑 `recalculate_student_grade_rankings()`。前端 `loadParentSessions` 傳 `p_subject`。 |
| 2026-04 | **題幹分段顯示**：`QuestionContentParagraphs` — 題目／解釋支援 **單個 `\n` 換行** 與 **空行 `\n\n` 分段**（不需改表結構；在 Supabase `questions.content`／`explanation` 內輸入換行即可）。用於答題泡泡、結果頁與家長詳情。**無 SQL**。 |
| 2026-04 | 學生答題選項：移除 `truncate`／單行限制，改為 **`whitespace-normal` + `break-words` + `leading-snug`**，長答案可多行顯示（`StudentQuizExperience` / `OptionButton`）。**無 SQL**。 |
| 2026-04 | **測試數據**：`supabase_seed_chinese_30_sessions_91917838.sql` — 與現行 **`quiz_sessions`** 欄位一致（`session_token` UNIQUE 前綴 `gearup_seed_chinese_30-` + UUID、`session_practice_summary` 可為 NULL；**無** `session_practice_summary_parent`）。手動於 Supabase SQL Editor 執行。計劃：`test_plan_seed_chinese_30_sessions_91917838.md`。 |
| 2026-04 | **英文科目**：題庫 `subject = 'English'`；學生／家長／題目餘額與 **數學、中文** 並列。`register_student` 贈送 **English** 餘額 300（見 `supabase_question_balance_per_answer.sql`）；既有學生可選 `supabase_backfill_english_balance.sql`。同級排名隨科目（見「同級排名按科目」）。測試：`test_plan_english_subject.md`。 |
| 2026-04 | **中文科目**：題庫 `subject = 'Chinese'`；學生選科、家長練習報告、戶口「題目餘額」支援 **數學／中文**（`src/lib/quiz-subjects.ts`）。`register_student` 於新戶口首次各送 **Math** 與 **Chinese** 餘額各 300（見 `supabase_question_balance_per_answer.sql` 內函數；已部署舊 RPC 請重跑該段或整份）。**既有學生**可選跑一次 `supabase_backfill_chinese_balance.sql` 補 `Chinese` 餘額列。測試：`src/lib/quiz-subjects.test.ts`、`test_plan_chinese_subject.md`。 |
| 2026-04 | **註冊私隱同意**：勾選「本人確認已閱讀並同意本平台的**私隱政策聲明**」（連結開啟彈窗載入 `.txt`）方可按「**同意並繼續**」。預設 URL：`{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Webpage_statements/privacy_statment.txt`；不同專案可設 **`NEXT_PUBLIC_PRIVACY_STATEMENT_URL`**。**無 SQL**。 |
| 2026-04 | **題目餘額**：每答一題在 `submit_answer` 內扣 **1** 題（未完成練習也照扣）；餘額不足時拒絕提交。家長端總餘額＝**同戶口所有學生**該科目餘額**加總**（共用池）；扣款優先從作答學生帳列扣，不足則扣兄弟姊妹列。交易 `balance_after` 為**戶口合計**。科目 **`Math`** 與舊 **`數學`** 在 RPC 內視為同一組（修正家長月曆「無交易」）。註冊贈送僅在該家長**尚無**該科目餘額列時發放（避免二孩各 +300）。SQL：**必跑** `supabase_question_balance_per_answer.sql`（含合併重複餘額列、`session_answers` 唯一索引防雙扣）。前端：每題後重讀 `get_student_balance`；結束練習不再呼叫 `deduct_student_balance`。測試清單：`test_plan_question_balance.md`。 |
| 2026-04 | **Apple touch icon + favicon**：`src/app/apple-icon.png`、`src/app/icon.png`（小香蕉吉祥物）。Next.js 自動提供 `/apple-icon.png` 與 `/icon.png`。**無 SQL**。 |
| 2026-04 | 科目主鍵為 **`Math`**；題庫／`parent_weights` 查詢用 `ilike(any)` 同時匹配 **`Math`** 與舊值 **`數學`**，以免資料尚未全數改名時出現「找不到題目」。完成 `UPDATE questions SET subject = 'Math' WHERE subject = '數學'`（及權重列）後仍可正常運作。**無額外 SQL**（僅建議在庫內統一 subject 字串）。 |
| 2026-04 | 練習小結：**電郵用** `session_practice_summary_parent`（老師對家長口吻）與結果頁 **分開**；重跑 `supabase_session_practice_summary.sql`（含 `save_session_practice_summaries`）。 |
| 2026-04 | **每節練習小結**（繁中 50–80 字、規則產生、可存 DB、郵件、「小香蕉」泡泡 UI）：見上節；SQL `supabase_session_practice_summary.sql`；`npm test` + `test_plan_practice_session_summary.md`。 |
| 2026-04 | 答題畫面後續：去吉祥物；多選題改為**點選即提交**（非短答仍用按鈕提交）。選項文字曾用單行 `truncate`，已改為**可換行**（見上列「學生答題選項」）。**無 SQL**。 |
| 2026-04 | 學生答題畫面：`StudentQuizExperience`；吉祥物預設路徑為同專案 Storage `Webpage_images/logo/...`；若檔在另一專案可設 `NEXT_PUBLIC_MASCOT_IMAGE_URL`。**無 SQL**。 |
| 2026-04 | 業務概覽「學校正確率」曆月：`admin_business_monthly` 內已改為 **僅讀 `quiz_sessions`**（按校 `sum(score)/sum(questions_attempted)` 加權，不再掃 `session_answers`），以降低 PostgREST 逾時。與單次練習內之逐題正確率一致。 |
| 2026-04 | `admin_today_business` / `admin_business_monthly`：已移除函數內 `SET LOCAL statement_timeout`（避免與 `STABLE`/權限相關的 `SET is not allowed in a non-volatile function`）；兩者仍為 **VOLATILE**。請重跑 `supabase_admin_business_kpi.sql`。 |
| 2026-04 | `supabase_admin_business_kpi.sql`：含 `students.hkt_reg_date`、`quiz_sessions.hkt_practice_date`（generated STORED）及索引；`admin_business_monthly` 內學校正確率改為各月單次 `GROUP BY school`（避免 12×N 校全表掃 `session_answers` 導致 PostgREST 逾時）。如曾跑舊版腳本，在 Supabase **重跑整份** `supabase_admin_business_kpi.sql`（idempotent）。`parent_dashboard_view_log.hkt_date` 與 `supabase_admin_business_kpi_index_fix.sql` 仍適用只缺 view log 欄位之表。 |
| 2026-04 | **Admin 業務概覽** (`/admin` → 業務概覽): 今日實時 KPI（刷新）+ 月結靜態趨勢圖。Supabase 執行 `supabase_admin_business_kpi.sql` 與 `supabase_profile_update.sql`；Vercel 需 `SUPABASE_SERVICE_ROLE_KEY`。API：`POST` `/api/admin/business-today`、`/api/admin/business-monthly`（帳密同 `ADMIN_CONSOLE_*`）。家長儀表板載入時呼叫 `log_parent_dashboard_view`；學生「姓別」按鈕同步寫入 `students.gender` (M/F)。 |
| 2026-04 | Parent dashboard: subject selector **above** grade-rank block (`src/app/page.tsx` / `ParentDashboard`). |
| 2026-04 | Cron: `/api/cron-recalculate-averages` `part=rank` / `part=grade`, `SUPABASE_SERVICE_ROLE_KEY`, SQL chain for `grade_averages` + `student_grade_rankings` (see sections above). |
| 2026-05 | **Business KPI 排除測試數據（`9999*` 手機）**：前後端 KPI 邏輯已統一排除測試家長資料；新增一鍵 SQL：`supabase_admin_business_kpi_exclude_test_mobile_9999.sql`（更新 `admin_today_business`、`admin_business_monthly_summary`、`admin_business_school_details`）。另修正「今日新增月費用戶／月費新增趨勢」來源改以 `parents.paid_started_at` 為準（舊環境保留 fallback）。 |
| 2026-05 | **Admin 折扣碼使用摘要**：`實付總額 / 原價總額 / 折扣總額` 改為僅統計 `status = paid` 訂單，避免把未付款紀錄算入金額。 |
| 2026-05 | **家長端 UI 微調（已上線）**：① 登入頁新增宣傳句並套用較活潑字型；② 練習結果頁「小香蕉圖示」改為 banner（可用 `NEXT_PUBLIC_PRACTICE_RESULT_BANNER_URL` 覆蓋，預設走 Supabase Storage）；③ 身份選擇頁新增客服入口：月費家長顯示 WhatsApp `wa.me/85252861715?text=客戶服務查詢`、免費家長顯示 `cs@hkedutech.com`；④ 家長頁面客服電郵統一為 `cs@hkedutech.com`；⑤ 免費家長升級文案更新。 |
| 2026-05 | **Airwallex 付款方式修正（Apple Pay / Google Pay / AlipayHK / WeChat Pay / Card）**：修正 `payment_intents/create` metadata 格式錯誤、HPP locale 設為 `zh-HK`、補齊 Apple Pay HPP 參數，並調整方法清單策略，最終確認付款頁可同時顯示 5 大方式。新增方法防呆：`src/lib/airwallex-checkout-methods.ts` + 單元測試 `src/lib/airwallex-checkout-methods.test.ts`，避免後續改動誤刪 `all` 模式必要方法。 |
| 2026-05 | **Strict AI-only 出題模式**：`fetchAllQuestions` 新增 `source = 'AI'`，並在開題時啟用嚴格題池檢查（不足即阻擋並顯示明確訊息）。新增 `src/lib/question-source.ts` + `question-source.test.ts`；新增 SQL `supabase_questions_ai_source_strict_mode.sql`（`source` 正規化 + 索引）。 |
| 2026-05 | **Admin 付款狀態頁新增月費明細表**：在「付款狀態查詢」下方新增按月摘要（預設當月）與月選擇器，顯示「新增月費家長數、交易筆數、金額」及家長明細；支援下載當月已付款交易 CSV（審計用途）。後端新增 action：`payment_monthly_paid_summary`，工具檔：`src/lib/admin-paid-summary.ts`。 |
| 2026-05 | **家長題目餘額交易紀錄（paid tier）修正**：修正 paid tier 練習未寫入 `balance_transactions` 導致帳戶維護看不到新扣減紀錄；新增 `PAID_TIER_USAGE` 記錄。另修正 hotfix：`balance_after` 改用 `-1`（Unlimited sentinel，符合 NOT NULL），前端顯示為 `Unlimited`。SQL：`supabase_fix_paid_tier_balance_history_logging.sql`。 |

## Handover note — 2026-05-08 (for next working session)

- `main` 已包含當日功能與修正（最後推送 commit：`80308e0`）。
- 今日重點已完成並部署：
  - KPI 測試數據排除 + 月費新增統計修正。
  - Admin 折扣碼摘要金額計算修正。
  - 多項前端文案／客服／banner UI 微調。
- **可能仍需人工確認**（若尚未執行）：在 Supabase SQL Editor 執行  
  `supabase_admin_business_kpi_exclude_test_mobile_9999.sql`  
  以確保 DB 端 KPI RPC 與前端顯示邏輯完全一致。
- 下次開工建議先做：
  1. 在 admin business KPI 頁確認 `9999*` 測試帳戶不再出現在今日、月結、學校圖表。
  2. 用一個月費家長驗證身份選擇頁 WhatsApp 客服按鈕（含預填文字）。
  3. 用一個免費家長驗證客服電郵顯示與升級文案。

## Handover note — 2026-05-11 (payment methods + safeguard)

- `main` 已包含 Airwallex 付款模組本日修正（最新推送 commit：`17596ee`）。
- 今日完成並已部署：
  - 修正 Airwallex `payment_intents/create` 驗證錯誤（移除不合法 metadata 陣列欄位）。
  - HPP 語言固定為 `zh-HK`（繁中）。
  - Apple Pay 啟用與可用性診斷補強（含 `payment_method_types` 診斷回傳）。
  - 付款方式顯示回復為 5 大方式：`card`, `applepay`, `googlepay`, `alipayhk`, `wechatpay`。
- 新增防呆（避免未來誤刪方法）：
  - `src/lib/airwallex-checkout-methods.ts`
    - `getAirwallexMethodsForSelection()`
    - `applyAirwallexMethodSafeguards()`
  - `src/lib/airwallex-checkout-methods.test.ts`（Vitest）
  - `/api/payment/checkout` 會在 `payment_method = all` 時自動補回缺少的必要方法並附加 warning 診斷訊息。
- 明日交接建議先驗證：
  1. 付款頁是否穩定顯示 5 種方法（iPhone Safari / iPhone Chrome / Desktop Chrome 各一次）。
  2. `npm test` 是否包含新防呆測試通過。
  3. 用無折扣與有折扣各測 1 單，確認 callback 與升級流程不回歸。

## Handover note — 2026-05-13 (AI-only + paid summary + balance history hotfix)

- `main` 已包含今日三組更新（latest commit：`22d3d5a`）。
- 今日已完成並部署：
  1. **Strict AI-only 出題**：只抽 `questions.source = 'AI'`；若題庫不足會阻擋開題並提示。
  2. **Admin 付款狀態查詢頁**：新增「月費家長月度明細」區塊（月份選擇、家長明細表、CSV 匯出）。
  3. **家長題目餘額交易紀錄**：修正 paid tier 練習紀錄未入帳問題，交易可在家長「題目餘額」看到。

- **明早第一步（必做）**：在 Supabase SQL Editor 執行  
  `supabase_fix_paid_tier_balance_history_logging.sql`  
  > 注意：本檔已修正 `balance_after` NOT NULL 問題，paid tier 以 `-1` 代表 Unlimited。

- 建議明日 smoke test：
  1. 用 paid 家長（例：`91917838`）做中文 + 數學練習，各作答 2–3 題，確認「題目餘額」當月紀錄有更新（描述 `當日合計扣除`）。
  2. 到 `/admin` → `付款狀態查詢` 下方，切換月份確認摘要數字與明細表會更新；下載 CSV 檢查欄位完整性。
  3. 隨機抽一個年級/科目開題，確認 AI 題庫不足時會顯示阻擋訊息；題庫足夠時正常進入練習。
  4. 跑一次 `npm test && npm run lint && npm run build`，確認無回歸。

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file with your Supabase credentials:

   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

   Optional overrides for the login page marketing assets (defaults use `NEXT_PUBLIC_SUPABASE_URL` + public Storage paths):

   ```
   NEXT_PUBLIC_LOGIN_HERO_LOGO_URL=https://…/GearUplogo.png
   NEXT_PUBLIC_LOGIN_BG_IMAGE_URL=https://…/bk.png
   NEXT_PUBLIC_LOGIN_LOGO_URL=https://…/GearUp_Chi_Eng.png
   NEXT_PUBLIC_SITE_ICON_URL=https://…/logo_banana_student.png
   NEXT_PUBLIC_PLATFORM_BRIEF_URL=https://…/platform_brief.txt
   ```

   Default hero logo and full-page background (when env vars are omitted) use `question-images/Banana images/` paths under your Supabase project—same as the original login styling. Prefer **`NEXT_PUBLIC_SUPABASE_URL`** in Vercel; if missing, the build still picks up **`SUPABASE_URL`** via `next.config.ts`. To force exact URLs, set overrides below.

```
NEXT_PUBLIC_LOGIN_BG_IMAGE_URL=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/question-images/Banana%20images/bk.png
```

3. Run the development server:

   ```bash
   npm run dev
   ```

4. Quality checks:

   ```bash
   npm run lint
   npm test
   npm run build
   ```

## Login page: assets, home screen, logo, brief

After opening `/`, you should see:

1. **Full-page background** — `bk.png` is shown as a **repeating tile** (natural image size, not stretched edge-to-edge), with **blur** on that layer and a light veil (`bg-white/45`). Set **`NEXT_PUBLIC_SUPABASE_URL`** or **`NEXT_PUBLIC_LOGIN_BG_IMAGE_URL`** so the URL resolves in the browser.
2. **Original top hero logo** — `GearUplogo.png` from `question-images/Banana images/` above the subtitle.
3. Login card, then **加入主畫面**, divider, **Chi/Eng marketing logo**, and **platform brief** (`platform_brief.txt`).

Scroll below the white card if you do not see the lower logo or brief on small screens.

### Controls & lower section

1. **加入主畫面** — Uses the browser install prompt when available (e.g. Chrome/Edge/Android). Otherwise a modal explains **iOS Safari** (Share → 加入主畫面), **Android**, and **desktop** shortcuts.
2. A horizontal divider, then the **GearUp Chi/Eng logo** from Supabase Storage (public bucket).
3. **Platform brief** — Loaded from `platform_brief.txt` at runtime. Encoding is detected as **UTF-8** or **Big5** (Traditional Chinese). Paragraphs are separated by blank lines in the file.

Asset URLs are built in `src/lib/login-marketing-assets.ts`. Defaults:

- Hero (top): `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images/Banana%20images/GearUplogo.png`
- Background: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images/Banana%20images/bk.png`
- Marketing logo (lower): `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Webpage_images/logo/GearUp_Chi_Eng.png`
- Brief: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Webpage_images/logo/platform_brief.txt`

The app also exposes **`/manifest.webmanifest`** using the **site icon** (`logo_banana_student.png` by default). Override with **`NEXT_PUBLIC_SITE_ICON_URL`**.

**Note:** **登入** calls **`login_by_mobile`** and starts the quiz only after PIN verification; it is no longer a “demo only” button without Supabase auth.

## Supabase: RLS and quiz writes

Production uses **Row Level Security** (`supabase_rls_policies.sql` from `cursor/parent-grade-rank-dashboard-98ae`): the **`anon`** role may **`SELECT`** questions but **must not** insert into **`quiz_sessions`** or **`session_answers`** directly. All writes go through **`SECURITY DEFINER`** RPCs in **`supabase_rpc_functions.sql`**.

The app now:

1. **`login_by_mobile(p_mobile_number, p_pin_code)`** — server-side validates PIN and returns only matched students.
2. PINs are stored as bcrypt hashes in `students.pin_code`; plaintext PIN is never returned to frontend.
3. **`create_quiz_session(p_student_id, p_subject)`** — creates the session row with the real **`students.id`**.
4. **`submit_answer(...)`** and **`update_quiz_session(...)`** — record answers and scores.

After deploying functions, run **`supabase_grants_quiz_rpc_anon.sql`** so **`anon`** can **`EXECUTE`** these RPCs (otherwise PostgREST returns permission errors).

If you see **`Could not find the function public.login_by_mobile`** (or similar), apply **`supabase_rpc_functions.sql`** in the Supabase SQL Editor.


- **questions** — `id`, `content`, `opt_a`, `opt_b`, `opt_c`, `opt_d`, `correct_answer`, `explanation`, `subject`, `grade_level`
  - App quiz subjects: DB keys **`Math`** (legacy **`數學`** still matched in queries), **`Chinese`**, **`English`**; see `src/lib/quiz-subjects.ts`.
- **quiz_sessions** — `id`, `student_id` (**uuid**, real student from login), `subject`, `questions_attempted`, `score`, `time_spent_seconds` — created via RPC **`create_quiz_session`**, not direct insert.
- **session_answers** — `id`, `session_id`, `question_id`, `student_answer`, `is_correct`
