-- Soft #261 — Pending question review store + admin RPCs (NOT live practice)
-- Run in Supabase Dashboard → SQL Editor AFTER Colin's own-words apply-yes.
-- Effect: Creates pending batch/item tables, generation_batch_id on live questions, admin RPCs for list/edit/approve/reject/batch insert.

BEGIN;

-- Optional column on live bank for post-approve traceability
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS generation_batch_id TEXT;

CREATE TABLE IF NOT EXISTS public.question_generation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_key TEXT NOT NULL UNIQUE,
  grade_level TEXT NOT NULL,
  subject TEXT NOT NULL,
  requested_pdf_seed_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_pdf_seed_count >= 0),
  requested_ai_seed_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_ai_seed_count >= 0),
  requested_new_question_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_new_question_count >= 0),
  actual_pdf_seed_count INTEGER CHECK (actual_pdf_seed_count IS NULL OR actual_pdf_seed_count >= 0),
  actual_ai_seed_count INTEGER CHECK (actual_ai_seed_count IS NULL OR actual_ai_seed_count >= 0),
  type_mix_plan JSONB,
  question_key_prefix TEXT NOT NULL DEFAULT 'GEN261-',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS question_generation_batches_grade_subject_idx
  ON public.question_generation_batches (grade_level, subject, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pending_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.question_generation_batches (id) ON DELETE RESTRICT,
  batch_key TEXT NOT NULL,
  question_key TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  subject TEXT NOT NULL,
  question_type TEXT NOT NULL,
  paper_rank TEXT NOT NULL DEFAULT 'AI',
  grade_level TEXT NOT NULL,
  content TEXT NOT NULL,
  opt_a TEXT NOT NULL,
  opt_b TEXT NOT NULL,
  opt_c TEXT NOT NULL,
  opt_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK (upper(trim(correct_answer)) IN ('A', 'B', 'C', 'D')),
  explanation TEXT,
  language_code TEXT,
  tone_notes TEXT,
  needs_figure BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT,
  approved_live_question_id UUID REFERENCES public.questions (id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (question_key)
);

CREATE INDEX IF NOT EXISTS pending_questions_status_grade_subject_idx
  ON public.pending_questions (review_status, grade_level, subject, created_at DESC);

CREATE INDEX IF NOT EXISTS pending_questions_batch_key_idx
  ON public.pending_questions (batch_key);

ALTER TABLE public.question_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_questions ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies: student practice never reads these tables.

CREATE OR REPLACE FUNCTION public.admin_list_pending_questions(
  p_grade_level TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_batch_key TEXT DEFAULT NULL,
  p_review_status TEXT DEFAULT 'pending',
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_limit INTEGER;
BEGIN
  v_status := COALESCE(NULLIF(trim(p_review_status), ''), 'pending');
  IF v_status NOT IN ('pending', 'approved', 'rejected', 'all') THEN
    RAISE EXCEPTION '審核狀態無效，請選擇待審、已批准、已拒絕或全部。';
  END IF;
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 100), 500));

  RETURN COALESCE((
    SELECT json_build_object(
      'items', json_agg(row_to_json(q) ORDER BY q.created_at DESC),
      'total', (
        SELECT COUNT(*)::int
        FROM pending_questions pq
        WHERE (v_status = 'all' OR pq.review_status = v_status)
          AND (p_grade_level IS NULL OR trim(p_grade_level) = '' OR pq.grade_level = trim(p_grade_level))
          AND (p_subject IS NULL OR trim(p_subject) = '' OR pq.subject = trim(p_subject))
          AND (p_batch_key IS NULL OR trim(p_batch_key) = '' OR pq.batch_key = trim(p_batch_key))
      )
    )
    FROM (
      SELECT
        pq.id,
        pq.batch_id,
        pq.batch_key,
        pq.question_key,
        pq.review_status,
        pq.subject,
        pq.question_type,
        pq.paper_rank,
        pq.grade_level,
        pq.content,
        pq.opt_a,
        pq.opt_b,
        pq.opt_c,
        pq.opt_d,
        pq.correct_answer,
        pq.explanation,
        pq.language_code,
        pq.tone_notes,
        pq.needs_figure,
        pq.image_url,
        pq.approved_live_question_id,
        pq.reviewed_at,
        pq.created_at,
        pq.updated_at
      FROM pending_questions pq
      WHERE (v_status = 'all' OR pq.review_status = v_status)
        AND (p_grade_level IS NULL OR trim(p_grade_level) = '' OR pq.grade_level = trim(p_grade_level))
        AND (p_subject IS NULL OR trim(p_subject) = '' OR pq.subject = trim(p_subject))
        AND (p_batch_key IS NULL OR trim(p_batch_key) = '' OR pq.batch_key = trim(p_batch_key))
      ORDER BY pq.created_at DESC
      LIMIT v_limit
      OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) q
  ), json_build_object('items', '[]'::json, 'total', 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_pending_question(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT row_to_json(pq)
    FROM pending_questions pq
    WHERE pq.id = p_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_pending_question(
  p_id UUID,
  p_content TEXT,
  p_opt_a TEXT,
  p_opt_b TEXT,
  p_opt_c TEXT,
  p_opt_d TEXT,
  p_correct_answer TEXT,
  p_explanation TEXT,
  p_question_type TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row pending_questions%ROWTYPE;
  v_correct TEXT;
BEGIN
  SELECT * INTO v_row FROM pending_questions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '找不到待審題目。';
  END IF;
  IF v_row.review_status <> 'pending' THEN
    RAISE EXCEPTION '只能編輯待審狀態的題目。';
  END IF;

  v_correct := upper(trim(p_correct_answer));
  IF v_correct NOT IN ('A', 'B', 'C', 'D') THEN
    RAISE EXCEPTION '正確答案必須為 A、B、C 或 D。';
  END IF;
  IF trim(COALESCE(p_opt_a, '')) = ''
     OR trim(COALESCE(p_opt_b, '')) = ''
     OR trim(COALESCE(p_opt_c, '')) = ''
     OR trim(COALESCE(p_opt_d, '')) = '' THEN
    RAISE EXCEPTION '四個選項皆不可留空。';
  END IF;

  UPDATE pending_questions SET
    content = trim(p_content),
    opt_a = trim(p_opt_a),
    opt_b = trim(p_opt_b),
    opt_c = trim(p_opt_c),
    opt_d = trim(p_opt_d),
    correct_answer = v_correct,
    explanation = NULLIF(trim(COALESCE(p_explanation, '')), ''),
    question_type = COALESCE(NULLIF(trim(p_question_type), ''), question_type),
    updated_at = NOW()
  WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row);
END;
$$;

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
      trim(COALESCE(v_item->>'paper_rank', 'AI')),
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
      v_row.paper_rank,
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

CREATE OR REPLACE FUNCTION public.admin_bulk_reject_pending_questions(p_ids UUID[])
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_row pending_questions%ROWTYPE;
  v_rejected INTEGER := 0;
  v_skipped INTEGER := 0;
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

    UPDATE pending_questions SET
      review_status = 'rejected',
      reviewed_at = NOW(),
      updated_at = NOW()
    WHERE id = v_row.id;

    v_rejected := v_rejected + 1;
  END LOOP;

  RETURN json_build_object(
    'rejected_count', v_rejected,
    'skipped_count', v_skipped
  );
END;
$$;

COMMIT;