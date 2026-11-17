-- Soft #262 — pending_questions paper_rank default + admin RPC coercion (schema/RPC only)
-- Run in Supabase Dashboard → SQL Editor AFTER Colin apply-yes (HOLD until owner yes).
-- Effect: Default pending paper_rank to A; batch insert + bulk approve coerce to AA/A/B/C for live questions.
-- shared-db: Preview uses prod Supabase hptttwbmwjaroazkosvr; applying this SQL is live immediately.
-- Prior one-shot data fix supabase_pending_paper_rank_fix_262.sql was already applied on prod — NOT in this file; do not re-run.

BEGIN;

ALTER TABLE public.pending_questions
  ALTER COLUMN paper_rank SET DEFAULT 'A';

-- Optional CHECK (omitted): other pending rows may still have paper_rank outside AA/A/B/C until cleaned up.
-- Precheck before a follow-up migration that adds the constraint:
--   SELECT paper_rank, COUNT(*)::int
--   FROM public.pending_questions
--   WHERE paper_rank IS NULL OR trim(paper_rank) NOT IN ('AA', 'A', 'B', 'C')
--   GROUP BY 1
--   ORDER BY 1;
-- Apply only when the query returns zero rows:
--   ALTER TABLE public.pending_questions
--     ADD CONSTRAINT pending_questions_paper_rank_check
--     CHECK (paper_rank IN ('AA', 'A', 'B', 'C'));

CREATE OR REPLACE FUNCTION public.admin_pending_batch_insert(
  p_batch_key TEXT,
  p_grade_level TEXT,
  p_subject TEXT,
  p_requested_pdf_seed_count INTEGER,
  p_requested_ai_seed_count INTEGER,
  p_requested_new_question_count INTEGER,
  p_actual_pdf_seed_count INTEGER DEFAULT NULL,
  p_actual_ai_seed_count INTEGER DEFAULT NULL,
  p_type_mix_plan JSONB DEFAULT NULL,
  p_question_key_prefix TEXT DEFAULT 'GEN261-',
  p_questions JSONB DEFAULT '[]'::jsonb
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID;
  v_prefix TEXT;
  v_item JSONB;
  v_inserted INTEGER := 0;
  v_qkey TEXT;
  v_paper_rank TEXT;
BEGIN
  IF trim(COALESCE(p_batch_key, '')) = '' THEN
    RAISE EXCEPTION '批次編號不可留空。';
  END IF;
  IF trim(COALESCE(p_grade_level, '')) = '' OR trim(COALESCE(p_subject, '')) = '' THEN
    RAISE EXCEPTION '年級與科目不可留空。';
  END IF;
  IF p_questions IS NULL OR jsonb_typeof(p_questions) <> 'array' THEN
    RAISE EXCEPTION '題目清單格式不正確。';
  END IF;

  v_prefix := COALESCE(NULLIF(trim(p_question_key_prefix), ''), 'GEN261-');

  INSERT INTO question_generation_batches (
    batch_key,
    grade_level,
    subject,
    requested_pdf_seed_count,
    requested_ai_seed_count,
    requested_new_question_count,
    actual_pdf_seed_count,
    actual_ai_seed_count,
    type_mix_plan,
    question_key_prefix
  ) VALUES (
    trim(p_batch_key),
    trim(p_grade_level),
    trim(p_subject),
    GREATEST(COALESCE(p_requested_pdf_seed_count, 0), 0),
    GREATEST(COALESCE(p_requested_ai_seed_count, 0), 0),
    GREATEST(COALESCE(p_requested_new_question_count, 0), 0),
    p_actual_pdf_seed_count,
    p_actual_ai_seed_count,
    p_type_mix_plan,
    v_prefix
  )
  ON CONFLICT (batch_key) DO UPDATE SET
    actual_pdf_seed_count = COALESCE(EXCLUDED.actual_pdf_seed_count, question_generation_batches.actual_pdf_seed_count),
    actual_ai_seed_count = COALESCE(EXCLUDED.actual_ai_seed_count, question_generation_batches.actual_ai_seed_count),
    type_mix_plan = COALESCE(EXCLUDED.type_mix_plan, question_generation_batches.type_mix_plan)
  RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_questions)
  LOOP
    v_qkey := trim(COALESCE(v_item->>'question_key', ''));
    IF v_qkey = '' THEN
      v_qkey := v_prefix || replace(gen_random_uuid()::text, '-', '');
    ELSIF position(v_prefix in v_qkey) <> 1 THEN
      v_qkey := v_prefix || v_qkey;
    END IF;

    v_paper_rank := trim(COALESCE(v_item->>'paper_rank', 'A'));
    IF v_paper_rank NOT IN ('AA', 'A', 'B', 'C') THEN
      v_paper_rank := 'A';
    END IF;

    INSERT INTO pending_questions (
      batch_id,
      batch_key,
      question_key,
      subject,
      question_type,
      paper_rank,
      grade_level,
      content,
      opt_a,
      opt_b,
      opt_c,
      opt_d,
      correct_answer,
      explanation,
      language_code,
      tone_notes,
      needs_figure,
      image_url
    ) VALUES (
      v_batch_id,
      trim(p_batch_key),
      v_qkey,
      trim(COALESCE(v_item->>'subject', p_subject)),
      trim(COALESCE(v_item->>'question_type', 'MCQ')),
      v_paper_rank,
      trim(COALESCE(v_item->>'grade_level', p_grade_level)),
      trim(v_item->>'content'),
      trim(v_item->>'opt_a'),
      trim(v_item->>'opt_b'),
      trim(v_item->>'opt_c'),
      trim(v_item->>'opt_d'),
      upper(trim(v_item->>'correct_answer')),
      NULLIF(trim(COALESCE(v_item->>'explanation', '')), ''),
      NULLIF(trim(COALESCE(v_item->>'language_code', '')), ''),
      NULLIF(trim(COALESCE(v_item->>'tone_notes', '')), ''),
      COALESCE((v_item->>'needs_figure')::boolean, false),
      NULLIF(trim(COALESCE(v_item->>'image_url', '')), '')
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN json_build_object(
    'batch_id', v_batch_id,
    'batch_key', trim(p_batch_key),
    'inserted_count', v_inserted
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_approve_pending_questions(p_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_row pending_questions%ROWTYPE;
  v_live_id UUID;
  v_prefix TEXT;
  v_approved INTEGER := 0;
  v_skipped INTEGER := 0;
  v_paper_rank TEXT;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION '請選擇至少一題。';
  END IF;

  FOREACH v_id IN ARRAY p_ids
  LOOP
    SELECT pq.* INTO v_row
    FROM pending_questions pq
    WHERE pq.id = v_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_row.review_status <> 'pending' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT qgb.question_key_prefix INTO v_prefix
    FROM question_generation_batches qgb
    WHERE qgb.id = v_row.batch_id;

    v_paper_rank := trim(COALESCE(v_row.paper_rank, 'A'));
    IF v_paper_rank NOT IN ('AA', 'A', 'B', 'C') THEN
      v_paper_rank := 'A';
    END IF;

    INSERT INTO public.questions (
      past_paper_id,
      subject,
      question_type,
      paper_rank,
      grade_level,
      content,
      opt_a,
      opt_b,
      opt_c,
      opt_d,
      correct_answer,
      explanation,
      image_url,
      question_key,
      source,
      generation_batch_id
    ) VALUES (
      NULL,
      v_row.subject,
      v_row.question_type,
      v_paper_rank,
      v_row.grade_level,
      v_row.content,
      v_row.opt_a,
      v_row.opt_b,
      v_row.opt_c,
      v_row.opt_d,
      v_row.correct_answer,
      v_row.explanation,
      v_row.image_url,
      v_row.question_key,
      'AI',
      v_row.batch_key
    )
    RETURNING id INTO v_live_id;

    UPDATE pending_questions SET
      review_status = 'approved',
      approved_live_question_id = v_live_id,
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_row.id;

    v_approved := v_approved + 1;
  END LOOP;

  RETURN json_build_object(
    'approved_count', v_approved,
    'skipped_count', v_skipped
  );
END;
$$;

COMMIT;