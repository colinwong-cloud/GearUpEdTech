# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Parent dashboard: 同級排名

- **位置**：家長「練習報告」頁面頂部（科目／月份切換上方）。
- **邏輯**（實作於 `supabase_grade_level_ranking.sql`）  
  - 只納入 **累積完成至少 100 題**（`sum(quiz_sessions.questions_attempted)`，僅 `questions_attempted > 0` 的次數）的同級學生。  
  - 分數＝**最近 10 次**練習的「每次正確率」之**平均**（不滿 10 次則以實有次數平均）。  
  - 以該分數在同期 **`students.grade_level`** 內用 **RANK** 排名（分數愈高，名次數字愈小＝愈前）。  
- **更新**：與原 `recalculate_grade_averages` 同一 Vercel Cron（`vercel.json` → `/api/cron-recalculate-averages`，每日 UTC 午夜）。Cron 內**先**呼叫 `recalculate_student_grade_rankings()`，再 `recalculate_grade_averages()`。
- **讀取**：`get_parent_student_grade_rank(p_student_id)`（`SECURITY DEFINER`）→ 前端在載入家長儀表板時與 sessions／圖表一併請求。
- **佈署新環境時**：在 Supabase 執行 `supabase_grade_level_ranking.sql` 一次，然後觸發 cron 或手動執行上述兩支函數。  
- **如批次／cron 出現** `DELETE requires a WHERE clause`：在 Supabase 執行 `supabase_fix_batch_delete_require_where.sql`（將 `DELETE FROM …` 改為 `DELETE FROM … WHERE true`）。  
- **測試**：見 `test_plan_grade_ranking.md`。

## Deployment

The app is deployed on Vercel (custom domain **q.hkedutech.com**; Vercel project `quiz-deploy` under scope `colinwong-clouds-projects`).

**Production URL:** https://q.hkedutech.com

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
