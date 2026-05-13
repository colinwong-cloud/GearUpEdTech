-- Strict AI-only question drawing support
-- Run in Supabase SQL Editor before enabling strict AI-only filtering in app.

begin;

-- Normalize existing source values so AI rows are consistent.
update public.questions
set source = 'AI'
where source is not null
  and lower(trim(source)) = 'ai'
  and source <> 'AI';

-- Keep core query path fast: subject + grade_level + source.
create index if not exists questions_subject_grade_source_idx
  on public.questions (subject, grade_level, source);

-- Optional focused index for strict AI-only lookups.
create index if not exists questions_ai_subject_grade_idx
  on public.questions (subject, grade_level)
  where source = 'AI';

commit;
