import { describe, expect, it } from "vitest";
import {
  buildBulkApproveConfirmMessage,
  buildBulkRejectConfirmMessage,
  coercePendingPaperRank,
  isPracticeQuestionTableOnly,
  summarizeBulkPendingResult,
} from "@/lib/pending-questions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("pending-questions confirm copy", () => {
  it("states approve goes live on www immediately", () => {
    const msg = buildBulkApproveConfirmMessage(2);
    expect(msg).toContain("立即在 www 上線");
    expect(msg).toContain("批准所選題目");
  });

  it("states reject stays out of practice", () => {
    const msg = buildBulkRejectConfirmMessage(1);
    expect(msg).toContain("不會進入學生練習題庫");
    expect(msg).toContain("拒絕所選題目");
  });
});

describe("pending paper_rank coercion (Soft #262)", () => {
  it("keeps valid live ranks", () => {
    expect(coercePendingPaperRank("AA")).toBe("AA");
    expect(coercePendingPaperRank("B")).toBe("B");
  });

  it("maps legacy AI insert default to A", () => {
    expect(coercePendingPaperRank("AI")).toBe("A");
    expect(coercePendingPaperRank("")).toBe("A");
    expect(coercePendingPaperRank(undefined)).toBe("A");
  });
});

describe("bulk pending skip counts", () => {
  it("summarizes approve with skipped non-pending", () => {
    expect(
      summarizeBulkPendingResult("approve", { approved_count: 2, skipped_count: 1 })
    ).toBe("已批准 2 題，略過 1 題（非待審或不存在）。");
  });

  it("summarizes reject", () => {
    expect(
      summarizeBulkPendingResult("reject", { rejected_count: 3, skipped_count: 0 })
    ).toBe("已拒絕 3 題，略過 0 題（非待審或不存在）。");
  });
});

describe("practice isolation", () => {
  it("student fetch uses questions table only", () => {
    expect(isPracticeQuestionTableOnly("questions")).toBe(true);
    expect(isPracticeQuestionTableOnly("pending_questions")).toBe(false);
  });

  it("fetchAllQuestions keeps AI-only filter on public.questions", () => {
    const pagePath = resolve(process.cwd(), "src/app/page.tsx");
    const src = readFileSync(pagePath, "utf8");
    expect(src).toContain('.from("questions")');
    expect(src).toContain('.eq("source", AI_QUESTION_SOURCE)');
    expect(src).not.toContain('from("pending_questions")');
  });

  it("tutor practice store keeps AI-only filter on public.questions", () => {
    const storePath = resolve(process.cwd(), "src/lib/server/tutor-practice-paper-store.ts");
    const src = readFileSync(storePath, "utf8");
    expect(src).toContain('.from("questions")');
    expect(src).toContain('.eq("source", AI_QUESTION_SOURCE)');
    expect(src).not.toContain("pending_questions");
  });
});