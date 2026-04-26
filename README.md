# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Parent dashboard: 同級排名

- **位置**：家長「練習報告」內容區**由上而下**為：① **科目**切換（例：數學）→ ② **同級排名**（`ParentGradeRankPanel`）→ ③ **月份**導航與列表／圖表。純前端順序，無需改 DB。
- **邏輯**（實作於 `supabase_grade_level_ranking.sql`）  
  - 只納入 **累積完成至少 100 題**（`sum(quiz_sessions.questions_attempted)`，僅 `questions_attempted > 0` 的次數）的同級學生。  
  - 分數＝**最近 10 次**練習的「每次正確率」之**平均**（不滿 10 次則以實有次數平均）。  
  - 以該分數在同期 **`students.grade_level`** 內用 **RANK** 排名（分數愈高，名次數字愈小＝愈前）。  
- **更新**：與原 `recalculate_grade_averages` 同一 Vercel Cron（`vercel.json` → `/api/cron-recalculate-averages`，每日 UTC 午夜）。Cron 內**先**呼叫 `recalculate_student_grade_rankings()`，再 `recalculate_grade_averages()`。
- **讀取**：`get_parent_student_grade_rank(p_student_id)`（`SECURITY DEFINER`）→ 前端在載入家長儀表板時與 sessions／圖表一併請求。
- **佈署新環境時**：在 Supabase 執行 `supabase_grade_level_ranking.sql` 一次，然後觸發 cron 或手動執行上述兩支函數。  
- **如批次／cron 出現** `DELETE requires a WHERE clause`：在 Supabase 執行 `supabase_fix_batch_delete_require_where.sql`（將 `DELETE FROM …` 改為 `DELETE FROM … WHERE true`）。  
- **如出現** `canceling statement due to statement timeout`：資料量較大時，原先排名批次對每位學生子查詢掃表會過慢；請在 Supabase 執行 `supabase_optimize_ranking_batch_performance.sql`（加索引、改寫成集合式查詢，並在函數內 `SET LOCAL statement_timeout = '5min'`）。Vercel 路由 `/api/cron-recalculate-averages` 已設 `maxDuration = 300`（秒），需重新部署才生效。  
- **如仍超時**（兩道 RPC 各跑一輪仍觸及 PostgREST 單次請求上限）：每日批次已拆成兩個 Vercel Cron——`?part=rank`（0:00 UTC）與 `?part=grade`（0:02 UTC），見 `vercel.json`。（可選）在 Vercel 專案加入 `SUPABASE_SERVICE_ROLE_KEY` 讓 API 以 service role 呼叫 RPC。依序執行：`supabase_optimize_grade_averages_batch.sql` → `supabase_split_grade_averages_cron.sql` → `supabase_grade_averages_two_step_per_grade.sql`；若**單一年級的「全部題型」**仍超時，執行 `supabase_grade_by_question_type_fine.sql`；若 `?part=grade` 仍失敗，再執行 `supabase_grade_cron_v2_query_plans.sql`（索引＋從 `students`／`questions` 驅動的 `overall` / `one_type`）；務必在 Vercel 設定 `SUPABASE_SERVICE_ROLE_KEY`（僅專案密鑰，勿入庫）。  
- **測試**：見 `test_plan_grade_ranking.md`。
- **最後一併執行** `supabase_grade_cron_delete_and_grants.sql`：新增 `delete_grade_averages_for_grade(grade_level)`，並補齊 `GRANT EXECUTE` 給 cron 會呼叫的函數。API 在 fallback 到 `recalculate_grade_by_type_for_grade` 前可刪除該年級列，避免 unique 衝突。  

### Nightly batch (English)

- Vercel env: `CRON_SECRET` (bearer for `/api/cron-recalculate-averages`), `SUPABASE_SERVICE_ROLE_KEY` (strongly recommended for long RPCs).
- Recommended SQL order for chart/rank recalc: `…optimize_grade…` → `…split…` → `…two_step…` → `…by_question_type_fine…` → `supabase_grade_cron_v2_query_plans.sql` → `supabase_grade_cron_delete_and_grants.sql`.
- Response includes `use_service_role: true` when the service key is set.

## Deployment

The app is deployed on Vercel (custom domain **q.hkedutech.com**; Vercel project `quiz-deploy` under scope `colinwong-clouds-projects`).

**Production URL:** https://q.hkedutech.com

Changes are committed on branch `cursor/quiz-app-vercel-deployment-7068` and deployed to Vercel with `vercel link` (scope `colinwong-clouds-projects`, project `quiz-deploy`) and `vercel deploy --prod`.

## Changelog (recent)

| Date (approx) | Change |
|----------------|--------|
| 2026-04 | 學生答題畫面：`StudentQuizExperience`；吉祥物預設路徑為同專案 Storage `Webpage_images/logo/...`；若檔在另一專案可設 `NEXT_PUBLIC_MASCOT_IMAGE_URL`。**無 SQL**。 |
| 2026-04 | 業務概覽「學校正確率」曆月：`admin_business_monthly` 內已改為 **僅讀 `quiz_sessions`**（按校 `sum(score)/sum(questions_attempted)` 加權，不再掃 `session_answers`），以降低 PostgREST 逾時。與單次練習內之逐題正確率一致。 |
| 2026-04 | `admin_today_business` / `admin_business_monthly`：已移除函數內 `SET LOCAL statement_timeout`（避免與 `STABLE`/權限相關的 `SET is not allowed in a non-volatile function`）；兩者仍為 **VOLATILE**。請重跑 `supabase_admin_business_kpi.sql`。 |
| 2026-04 | `supabase_admin_business_kpi.sql`：含 `students.hkt_reg_date`、`quiz_sessions.hkt_practice_date`（generated STORED）及索引；`admin_business_monthly` 內學校正確率改為各月單次 `GROUP BY school`（避免 12×N 校全表掃 `session_answers` 導致 PostgREST 逾時）。如曾跑舊版腳本，在 Supabase **重跑整份** `supabase_admin_business_kpi.sql`（idempotent）。`parent_dashboard_view_log.hkt_date` 與 `supabase_admin_business_kpi_index_fix.sql` 仍適用只缺 view log 欄位之表。 |
| 2026-04 | **Admin 業務概覽** (`/admin` → 業務概覽): 今日實時 KPI（刷新）+ 月結靜態趨勢圖。Supabase 執行 `supabase_admin_business_kpi.sql` 與 `supabase_profile_update.sql`；Vercel 需 `SUPABASE_SERVICE_ROLE_KEY`。API：`POST` `/api/admin/business-today`、`/api/admin/business-monthly`（帳密同 `ADMIN_CONSOLE_*`）。家長儀表板載入時呼叫 `log_parent_dashboard_view`；學生「姓別」按鈕同步寫入 `students.gender` (M/F)。 |
| 2026-04 | Parent dashboard: subject selector **above** grade-rank block (`src/app/page.tsx` / `ParentDashboard`). |
| 2026-04 | Cron: `/api/cron-recalculate-averages` `part=rank` / `part=grade`, `SUPABASE_SERVICE_ROLE_KEY`, SQL chain for `grade_averages` + `student_grade_rankings` (see sections above). |

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

3. Run the development server:
   ```bash
   npm run dev
   ```

## Database Schema

The app expects these Supabase tables:

- **questions** — `id`, `content`, `opt_a`, `opt_b`, `opt_c`, `opt_d`, `correct_answer`, `explanation`, `subject`, `grade_level`
- **quiz_sessions** — `id`, `student_id`, `subject`, `questions_attempted`, `score`, `time_spent_seconds`
- **session_answers** — `id`, `session_id`, `question_id`, `student_answer`, `is_correct`
