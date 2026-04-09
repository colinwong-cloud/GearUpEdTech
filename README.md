# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase. Quiz results can be emailed to students via [Resend](https://resend.com).

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file with your credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   RESEND_API_KEY=your-resend-api-key
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Deploy to Vercel

1. Push this repository to GitHub.

2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.

3. In the Vercel project settings, add these **Environment Variables**:

   | Variable | Description |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anonymous/public key |
   | `RESEND_API_KEY` | Your Resend API key (from [resend.com/api-keys](https://resend.com/api-keys)) |

4. Click **Deploy**. Vercel will automatically detect the Next.js framework and build the project.

Subsequent pushes to the `main` branch will trigger automatic redeployments.

## Email Integration (Resend)

After completing a quiz, students can enter their email address to receive a formatted results summary. The email is sent via the Resend API through a server-side API route (`/api/send-results`), so the API key is never exposed to the browser.

> **Note:** The default sender address is `onboarding@resend.dev` (Resend's shared testing domain). To send from your own domain, [verify a domain in Resend](https://resend.com/docs/dashboard/domains/introduction) and update the `from` field in `src/app/api/send-results/route.ts`.

## Database Schema

The app expects these Supabase tables:

- **questions** — `id`, `content`, `opt_a`, `opt_b`, `opt_c`, `opt_d`, `correct_answer`, `explanation`, `subject`, `grade_level`
- **quiz_sessions** — `id`, `student_id`, `subject`, `questions_attempted`, `score`, `time_spent_seconds`
- **session_answers** — `id`, `session_id`, `question_id`, `student_answer`, `is_correct`
