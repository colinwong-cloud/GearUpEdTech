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

1. **`login_by_mobile(p_mobile_number)`** — loads students for that parent phone.
2. Matches **`pin_code`** to the student PIN entered on the login form (same rule as the full app). If you have **multiple children** with the same PIN, the **first** matching student is used; give distinct PINs per child if needed.
3. **`create_quiz_session(p_student_id, p_subject)`** — creates the session row with the real **`students.id`**.
4. **`submit_answer(...)`** and **`update_quiz_session(...)`** — record answers and scores.

After deploying functions, run **`supabase_grants_quiz_rpc_anon.sql`** so **`anon`** can **`EXECUTE`** these RPCs (otherwise PostgREST returns permission errors).

If you see **`Could not find the function public.login_by_mobile`** (or similar), apply **`supabase_rpc_functions.sql`** in the Supabase SQL Editor.


- **questions** — `id`, `content`, `opt_a`, `opt_b`, `opt_c`, `opt_d`, `correct_answer`, `explanation`, `subject`, `grade_level`
- **quiz_sessions** — `id`, `student_id` (**uuid**, real student from login), `subject`, `questions_attempted`, `score`, `time_spent_seconds` — created via RPC **`create_quiz_session`**, not direct insert.

- **session_answers** — `id`, `session_id`, `question_id`, `student_answer`, `is_correct`
