/** Soft #261 — pending question review (never served in student practice). */

export const PENDING_REVIEW_STATUS_PENDING = "pending";
export const PENDING_REVIEW_STATUS_APPROVED = "approved";
export const PENDING_REVIEW_STATUS_REJECTED = "rejected";
export const PENDING_REVIEW_STATUS_ALL = "all";

export const PENDING_QUESTIONS_SQL_FILE = "supabase_question_pending_review_261.sql";
export const PENDING_QUESTIONS_GRANTS_SQL_FILE = "supabase_question_pending_review_261_grants.sql";

export const PENDING_BATCH_INSERT_DOC_PATH = "docs/grok-bot-pending-insert-261.md";

export type PendingReviewStatus =
  | typeof PENDING_REVIEW_STATUS_PENDING
  | typeof PENDING_REVIEW_STATUS_APPROVED
  | typeof PENDING_REVIEW_STATUS_REJECTED
  | typeof PENDING_REVIEW_STATUS_ALL;

export interface PendingQuestionRow {
  id: string;
  batch_id: string;
  batch_key: string;
  question_key: string;
  review_status: Exclude<PendingReviewStatus, typeof PENDING_REVIEW_STATUS_ALL>;
  subject: string;
  question_type: string;
  paper_rank: string;
  grade_level: string;
  content: string;
  opt_a: string;
  opt_b: string;
  opt_c: string;
  opt_d: string;
  correct_answer: string;
  explanation: string | null;
  language_code: string | null;
  tone_notes: string | null;
  needs_figure: boolean;
  image_url: string | null;
  approved_live_question_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendingQuestionListResult {
  items: PendingQuestionRow[];
  total: number;
}

export interface BulkPendingMutationResult {
  approved_count?: number;
  rejected_count?: number;
  skipped_count: number;
}

export function buildBulkApproveConfirmMessage(selectedCount: number): string {
  return (
    `已選 ${selectedCount} 題。\n` +
    "批准後題目會立即在 www 上線（寫入正式題庫 source=AI），確定要批准所選題目？"
  );
}

export function buildBulkRejectConfirmMessage(selectedCount: number): string {
  return (
    `已選 ${selectedCount} 題。\n` +
    "拒絕後不會進入學生練習題庫，僅保留審核記錄。確定要拒絕所選題目？"
  );
}

export function isPracticeQuestionTableOnly(tableName: string): boolean {
  const normalized = tableName.trim().toLowerCase();
  return normalized === "questions";
}

export function summarizeBulkPendingResult(
  action: "approve" | "reject",
  result: BulkPendingMutationResult
): string {
  const acted =
    action === "approve"
      ? result.approved_count ?? 0
      : result.rejected_count ?? 0;
  const skipped = result.skipped_count ?? 0;
  if (action === "approve") {
    return `已批准 ${acted} 題，略過 ${skipped} 題（非待審或不存在）。`;
  }
  return `已拒絕 ${acted} 題，略過 ${skipped} 題（非待審或不存在）。`;
}