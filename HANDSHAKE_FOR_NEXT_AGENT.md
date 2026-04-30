# Handshake Summary for Next Agent

## Project Overview

**GearUp Quiz** — A Next.js quiz platform for Hong Kong primary school students (P1-P6), deployed at **https://q.hkedutech.com** on Vercel. Backend is Supabase (PostgreSQL). The project is on branch `cursor/quiz-app-vercel-deployment-7068`.

---

## Tech Stack

- **Frontend:** Next.js 16.2.2 (App Router, Turbopack), React 19, Tailwind CSS v4, TypeScript
- **Backend:** Supabase (PostgreSQL, Storage, RPC functions)
- **Email:** Resend API (sender: `noreply@updates.hkedutech.com`)
- **CAPTCHA:** Cloudflare Turnstile on registration
- **Charts:** recharts (dynamic import, SSR disabled)
- **Deployment:** Vercel (project: `quiz-deploy`, scope: `colinwong-clouds-projects`)
- **Domain:** `q.hkedutech.com` (custom domain on Vercel)

---

## Critical Lessons Learned (READ THESE FIRST)

### 1. Supabase RLS blocks everything — use RPC functions
All tables have RLS enabled. The `anon` key CANNOT directly insert/update/delete on most tables. **All writes MUST go through `SECURITY DEFINER` RPC functions.** Only 3 tables allow direct SELECT: `questions`, `student_balances`, `parent_weights`. Even `parents` and `students` tables block SELECT — use `login_by_mobile` RPC for login.

### 2. Never include `student_id: "anonymous"` in quiz_sessions insert
The Supabase schema does not accept explicit `student_id` values in some contexts. Always use the actual student UUID from the logged-in session.

### 3. Vercel deployment — always link to the correct project
When deploying, always run: `rm -rf .vercel && vercel link --yes --token="$VERCEL_TOKEN" --scope colinwong-clouds-projects --project quiz-deploy` before deploying. Without this, Vercel may create a new project called "workspace" instead of deploying to `quiz-deploy`.

### 4. NEXT_PUBLIC_ env vars may have trailing newlines
The `NEXT_PUBLIC_SUPABASE_URL` on Vercel had a trailing newline that broke URLs. Always `.trim()` env vars when constructing URLs.

### 5. Supabase `getPublicUrl()` double-encodes URLs
When image URLs contain `%20` (spaces), extracting the path and passing to `getPublicUrl()` causes double-encoding (`%2520`). Fix: `decodeURIComponent()` the path before passing to `getPublicUrl()`.

### 6. `gen_random_bytes()` may not exist in Supabase
Use `gen_random_uuid()` instead. For token generation: `replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`.

### 7. Recharts — use unique index per bar, not date string
Using date strings as `XAxis dataKey` causes recharts to merge same-day bars. Use a unique index per bar and render dates via `tickFormatter`. This affects both tooltip accuracy and Cell color rendering.

### 8. Speed check timestamps must be recorded BEFORE async calls
Recording timestamps after `await supabase.rpc()` calls adds 2-4s of network latency per answer, making speed detection impossible. Record timestamps at the start of the handler.

### 9. Resend email sender domain
The verified domain is `updates.hkedutech.com` (NOT `hkedutech.com`). Sender must be `noreply@updates.hkedutech.com`.

### 10. Cloudflare Turnstile — hostname must be registered
Error 110200 = "Domain not authorized". The hostname `q.hkedutech.com` must be added in the Turnstile widget settings on Cloudflare dashboard.

### 11. Mobile number 999 prefix is blocked
Registration blocks mobile numbers starting with `999` (frontend validation). Test accounts use `99990001`, `99990002` which can only be created via SQL/RPC directly.

---

## File Structure

```
src/
├── app/
│   ├── page.tsx          # Main app (~3200 lines, all screens in one file)
│   ├── layout.tsx         # Root layout, background image
│   ├── globals.css        # Global styles, anti-copy CSS
│   ├── icon.png           # Favicon (banana logo)
│   ├── admin/page.tsx     # Admin console (/admin)
│   ├── reset-password/page.tsx  # Password reset landing page
│   └── api/
│       ├── send-quiz-email/route.ts      # Practice completion email
│       ├── send-reset-email/route.ts     # Password reset email
│       └── cron-recalculate-averages/route.ts  # Nightly grade averages
├── lib/
│   ├── supabase.ts        # Supabase client
│   └── types.ts           # TypeScript interfaces
vercel.json                # Cron job config (midnight UTC)
supabase_*.sql             # SQL migrations (20 files)
```

---

## App Flow (Screens in page.tsx)

```
login_mobile (mobile + PIN) 
  → register (new users)
  → forgot_password (email → reset link)
  → login_role (student / parent / account management)
      → login_student → subject_select → question_count_select → quiz → results
      → parent_student_select (if multi-student) → parent_dashboard → parent_session_detail
      → account_menu → profile_edit / add_student_form / balance_view
```

---

## Database: Key RPC Functions (~25 total)

| Function | Purpose |
|----------|---------|
| `login_by_mobile` | Login: returns parent + students (bypasses RLS) |
| `register_student` | Registration: create parent + student; **one** initial Math balance + gift transaction per **parent** (not per extra sibling) |
| `add_student_to_parent` | Add student under existing parent |
| `create_quiz_session` | Start quiz |
| `submit_answer` | Record answer, **deduct 1 question balance** (shared parent pool), log `balance_transactions`; raises if insufficient |
| `update_quiz_session` | Update score/progress |
| `deduct_student_balance` | Batch deduct + log (e.g. admin); `remaining_questions` in JSON = **family total** for that subject |
| `get_student_balance` | Read balance (bypasses RLS): `remaining_questions` = **sum across siblings** for subject (Math merges legacy `數學`) |
| `get_parent_balance_view` | Parent-level balance + monthly transactions with student names |
| `get_balance_transactions` | Monthly transaction history |
| `upsert_rank_performance` | Track per-rank performance |
| `get_quiz_email_data` | All data for practice completion email |
| `get_parent_sessions` | Monthly session summaries |
| `get_session_detail` | Session answers + questions for detail view |
| `get_student_chart_data` | Last 30 sessions + per-type breakdown for charts |
| `recalculate_grade_averages` | Nightly cron: calculate grade-level averages |
| `get_parent_profile` | Full profile for editing |
| `update_parent_profile` | Update parent name/email |
| `update_student_profile` | Update student details |
| `get_schools` | All schools for cascading dropdown |
| `report_question` | Student reports a question |
| `create_password_reset` | Generate reset token (checks email against specific parent) |
| `reset_password` | Validate token + update PIN for all students |
| `check_email_exists` | Registration: check email uniqueness |
| `admin_*` | Admin console functions (search, delete, quota, settings, questions) |

---

## Environment Variables (Vercel)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `RESEND_API_KEY` | Resend email API |
| `NEXT_PUBLIC_PRIVACY_STATEMENT_URL` | Optional. Full URL to privacy `.txt`; if unset, uses `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Webpage_statements/privacy_statment.txt` |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile (server, reserved) |
| `CRON_SECRET` | Nightly cron job auth (`gearup-cron-2026`) |

---

## Key Features

1. **Student quiz** — Login → select subject → choose question count (10/20/30) → quiz → results with wrong answer analysis
2. **Parent dashboard** — Monthly session summaries in 3-col grid, bar charts (overall + per-type), session detail view
3. **Registration** — Mobile + PIN + student info + school (3-tier dropdown) + email + Turnstile CAPTCHA + **short privacy checkbox** (link opens modal → `fetch` `.txt` from default URL or `NEXT_PUBLIC_PRIVACY_STATEMENT_URL`); submit **同意並繼續**
4. **Account management** — Update profile, add student, view balance + transactions
5. **Password recovery** — Email-based reset with 1-hour expiry tokens
6. **Email notifications** — Practice completion summary with strong/weak analysis (global + per-parent toggle)
7. **Admin console** (`/admin`) — Quota management, delete accounts, email toggles, question editor
8. **Anti-cheat** — Speed reminder if 3 answers in 5 seconds, anti-copy CSS, right-click disabled
9. **Question types** — Multiple choice (A-D), short answer (null options → text input), image questions
10. **Balance system** — 300 initial questions per **parent** (first student row); **−1 per answered question** in `submit_answer` (incomplete sessions still consume); siblings share pool (`get_student_balance` sums rows). Run `supabase_question_balance_per_answer.sql` for RPCs + index.

---

## Test Accounts

| Mobile | Password | Role | Notes |
|--------|----------|------|-------|
| `91917838` | (check DB) | Real user | Colin's account, students Loklok & Heihei |
| `99990001` | `123456` | Test | 3,570 students (6 per school), random scores |
| `99990002` | `123456` | Test | 108 good students (top school per district), 75-100% scores |

Admin console: `https://q.hkedutech.com/admin` — login: `colinwong` / `qweasd`

---

## Deployment Checklist

```bash
# Always run in this order:
cd /workspace
npm install
npm run lint
npm run build
git add -A && git commit -m "description" && git push -u origin cursor/quiz-app-vercel-deployment-7068
npm install -g vercel
rm -rf .vercel
vercel link --yes --token="$VERCEL_TOKEN" --scope colinwong-clouds-projects --project quiz-deploy
vercel deploy --prod --yes --token="$VERCEL_TOKEN" --scope colinwong-clouds-projects
```

---

## SQL Changes Workflow

When new features need database changes:
1. Create a `supabase_*.sql` file with all DDL + RPC functions
2. Commit and push to the branch
3. Tell the user to run it in **Supabase Dashboard > SQL Editor**
4. All RPC functions use `SECURITY DEFINER` + `SET search_path = public`
5. New tables need `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
6. Only add SELECT policies for tables the frontend reads directly

---

## Current Branch State

The `page.tsx` file is ~3200 lines containing ALL screens as a single-page app with state-based routing. There is no Next.js routing between screens (except `/admin`, `/reset-password`, and API routes). All quiz/parent/account screens are rendered conditionally based on the `screen` state variable of type `AppScreen`.
