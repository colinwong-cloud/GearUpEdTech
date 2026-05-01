# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase.

## Deploy (Vercel)

Production follows the **`main`** branch on GitHub. After pushing to `main`, Vercel builds and deploys automatically if the project is connected.

1. In [Vercel](https://vercel.com), open this GitHub repo as a project (Import → select `GearUpEdTech`).
2. Framework preset: **Next.js**. Root directory: repository root (default).
3. Add **Environment variables** (Production / Preview as needed):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Optional: `NEXT_PUBLIC_LOGIN_HERO_LOGO_URL`, `NEXT_PUBLIC_LOGIN_BG_IMAGE_URL`, `NEXT_PUBLIC_LOGIN_LOGO_URL`, `NEXT_PUBLIC_SITE_ICON_URL`, `NEXT_PUBLIC_PLATFORM_BRIEF_URL` (see [Login page assets](#login-page-assets-home-screen-logo-brief))
4. At build time, `next.config.ts` can copy **`SUPABASE_URL`** → **`NEXT_PUBLIC_SUPABASE_URL`** and **`SUPABASE_ANON_KEY`** → **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** when the public names are missing, so the **browser** can call Supabase (quiz + login assets). Use the **anon** key only, never `service_role`.
5. Deploy. The production URL is shown on the project’s **Deployments** tab (and under **Domains**).

If you opened a **preview deployment** or an older production URL, use the latest deployment from the dashboard or merge into `main` and wait for the build to finish—new login UI only appears after that build succeeds.

## Setup (local)

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
