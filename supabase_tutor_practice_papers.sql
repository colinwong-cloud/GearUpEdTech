-- Tutor offline practice papers.
-- A tutor generates one pair (student paper + answer paper) for a linked student.
-- Free tutors are limited to 4 generations per Hong Kong calendar month.
-- Re-downloading a saved paper does not create another row.
-- Safe to run multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tutor_practice_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID NOT NULL REFERENCES public.tutor_referral_codes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  student_name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  subject TEXT NOT NULL,
  questions JSONB NOT NULL,
  month_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tutor_practice_papers_month_key_chk CHECK (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  CONSTRAINT tutor_practice_papers_subject_chk CHECK (subject IN ('Math', 'Chinese', 'English'))
);

CREATE INDEX IF NOT EXISTS idx_tutor_practice_papers_code_month
  ON public.tutor_practice_papers (code_id, month_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tutor_practice_papers_code_student
  ON public.tutor_practice_papers (code_id, student_id, created_at DESC);

ALTER TABLE public.tutor_practice_papers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tutor_practice_papers'
      AND policyname = 'service_role_full_access_tutor_practice_papers'
  ) THEN
    CREATE POLICY service_role_full_access_tutor_practice_papers
      ON public.tutor_practice_papers
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.tutor_practice_papers
TO service_role;

COMMIT;
