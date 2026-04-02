# GearUp Quiz

Interactive quiz application built with Next.js, TypeScript, Tailwind CSS, and Supabase.

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
