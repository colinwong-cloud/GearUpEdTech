import { describe, it, expect } from "vitest";
import {
  buildSessionPracticeSummary,
  buildSessionPracticeSummaryForParent,
  buildPracticeComparison,
  priorSessionsFromChart,
  type AnswerLike,
} from "./session-practice-summary";
import { PRIMARY_QUIZ_SUBJECT } from "@/lib/quiz-subjects";
import type { Question } from "@/lib/types";

const q = (type: string, id: string, extra?: Partial<Question>): Question => ({
  id,
  past_paper_id: null,
  subject: PRIMARY_QUIZ_SUBJECT,
  question_type: type,
  paper_rank: "1",
  grade_level: "P4",
  content: extra?.content ?? "一個立體的長闊高分別是3cm、3cm、5cm，它是什麼形狀？",
  opt_a: "長方體",
  opt_b: "正方體",
  opt_c: null,
  opt_d: null,
  correct_answer: "B",
  explanation: extra?.explanation ?? "先睇長闊高係咪全部相等，先決定係正方體定長方體。",
  image_url: null,
  created_at: "",
  question_key: null,
  source: null,
  ...extra,
});

const mk = (type: string, id: string, correct: boolean, studentAnswer = "A"): AnswerLike => ({
  question: q(type, id, { correct_answer: correct ? studentAnswer : "B" }),
  isCorrect: correct,
  studentAnswer,
});

const mixedAnswers: AnswerLike[] = [
  mk("簡易方程（二）", "1", true),
  mk("簡易方程（二）", "2", true),
  mk("體積（二）", "3", false),
  mk("體積（二）", "4", false),
];

function prior(pct: number, id: string, createdAt: string) {
  return {
    id,
    score: pct,
    questions_attempted: 100,
    correct_pct: pct,
    created_at: createdAt,
  };
}

describe("buildPracticeComparison", () => {
  it("treats no prior sessions as first practice", () => {
    const c = buildPracticeComparison(70, [], { historyKnown: true });
    expect(c.mode).toBe("first");
    expect(c.priorCount).toBe(0);
    expect(c.trend).toBeNull();
  });

  it("compares to the last session when fewer than 10 priors exist", () => {
    const c = buildPracticeComparison(80, [prior(65, "a", "2026-08-01")], { historyKnown: true });
    expect(c.mode).toBe("last_one");
    expect(c.baselinePct).toBe(65);
    expect(c.trend).toBe("up");
  });

  it("uses a similar band for small gaps", () => {
    const c = buildPracticeComparison(72, [prior(70, "a", "2026-08-01")], { historyKnown: true });
    expect(c.trend).toBe("similar");
  });

  it("averages the last 10 sessions when history is long enough", () => {
    const priors = Array.from({ length: 10 }, (_, i) =>
      prior(70, `s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`)
    );
    const c = buildPracticeComparison(80, priors, { historyKnown: true });
    expect(c.mode).toBe("last_ten");
    expect(c.baselinePct).toBe(70);
    expect(c.trend).toBe("up");
  });
});

describe("priorSessionsFromChart", () => {
  it("excludes the current session and sorts newest first", () => {
    const prior = priorSessionsFromChart(
      [
        { id: "old", score: 5, questions_attempted: 10, created_at: "2026-08-01T00:00:00Z" },
        { id: "cur", score: 8, questions_attempted: 10, created_at: "2026-08-20T00:00:00Z" },
        { id: "mid", score: 6, questions_attempted: 10, created_at: "2026-08-10T00:00:00Z" },
      ],
      "cur"
    );
    expect(prior.map((s) => s.id)).toEqual(["mid", "old"]);
  });
});

describe("buildSessionPracticeSummary", () => {
  it("comments on the current result for a first practice", () => {
    const cmp = buildPracticeComparison(50, [], { historyKnown: true });
    const s = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT, cmp);
    expect(s).toContain("第一次完成練習");
    expect(s).toContain("今次正確率有");
    expect(s).toContain("50%");
    expect(s).toContain("體積（二）");
    expect(s).toContain("題型既");
    expect(s).toContain("你答咗");
    expect(s).toContain("想一想");
    expect(s.length).toBeGreaterThanOrEqual(20);
  });

  it("compares to the last practice when history is short", () => {
    const cmp = buildPracticeComparison(50, [prior(40, "a", "2026-08-01")], { historyKnown: true });
    const s = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT, cmp);
    expect(s).toContain("比上次");
    expect(s).toContain("進步喇");
    expect(s).not.toContain("近10次");
  });

  it("compares to the last 10 average when history is long", () => {
    const priors = Array.from({ length: 10 }, (_, i) =>
      prior(40, `s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`)
    );
    const cmp = buildPracticeComparison(50, priors, { historyKnown: true });
    const s = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT, cmp);
    expect(s).toContain("近10次平均");
    expect(s).toContain("進步喇");
  });

  it("encourages when the score dips", () => {
    const cmp = buildPracticeComparison(50, [prior(80, "a", "2026-08-01")], { historyKnown: true });
    const s = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT, cmp);
    expect(s).toContain("低少少都唔緊要");
  });

  it("quotes the student wrong option and a thinking step", () => {
    const s = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT);
    expect(s).toContain("你答咗 A (長方體)");
    expect(s).toContain("正確係 B (正方體)");
    expect(s).toContain("題型既");
    expect(s).toContain("一個立體的長闊高分別是3cm、3cm、5cm，它是什麼形狀？");
    expect(s).toContain("想一想：先睇長闊高係咪全部相等，先決定係正方體定長方體。");
    expect(s).toContain("。 下次再一齊加油！");
    expect(s).not.toContain("…");
  });

  it("keeps English spaces and full question plus explanation", () => {
    const englishWrong: AnswerLike = {
      question: q("Prepositions", "en1", {
        content: 'Choose the correct preposition: "We had lunch ___ noon."',
        opt_a: "in",
        opt_b: "on",
        opt_c: "at",
        opt_d: null,
        correct_answer: "C",
        explanation: 'We often use "at" for eating at a specific time, such as at noon.',
      }),
      isCorrect: false,
      studentAnswer: "B",
    };
    const s = buildSessionPracticeSummary(
      [mk("簡易方程（二）", "1", true), englishWrong],
      PRIMARY_QUIZ_SUBJECT
    );
    expect(s).toContain('Choose the correct preposition: "We had lunch ___ noon."');
    expect(s).toContain('We often use "at" for eating at a specific time, such as at noon.');
    expect(s).toContain("你答咗 B (on)");
    expect(s).toContain("正確係 C (at)");
    expect(s).not.toContain("Choosethecorrect");
    expect(s).not.toContain("…");
  });

  it("empty returns short fallback", () => {
    const s = buildSessionPracticeSummary([], PRIMARY_QUIZ_SUBJECT);
    expect(s.length).toBeGreaterThan(0);
  });
});

describe("buildSessionPracticeSummaryForParent", () => {
  it("uses the same comparison facts in teacher wording", () => {
    const priors = Array.from({ length: 10 }, (_, i) =>
      prior(70, `s${i}`, `2026-08-${String(i + 1).padStart(2, "0")}`)
    );
    const cmp = buildPracticeComparison(80, priors, { historyKnown: true });
    const student = buildSessionPracticeSummary(mixedAnswers, PRIMARY_QUIZ_SUBJECT, cmp);
    const parent = buildSessionPracticeSummaryForParent(
      mixedAnswers,
      PRIMARY_QUIZ_SUBJECT,
      "小明",
      cmp
    );
    expect(parent).not.toBe(student);
    expect(parent).toContain("小明");
    expect(parent).toContain("近10次平均");
    expect(parent).toContain("80%");
    expect(parent).toContain("70%");
    expect(parent).toMatch(/關於|敬啟/);
    expect(parent.length).toBeGreaterThanOrEqual(40);
  });

  it("quotes a wrong answer and thinking for parents too", () => {
    const parent = buildSessionPracticeSummaryForParent(mixedAnswers, PRIMARY_QUIZ_SUBJECT, "小明");
    expect(parent).toContain("題型的");
    expect(parent).toContain("答了");
    expect(parent).toContain("正確為");
    expect(parent).toContain("思路");
    expect(parent).toContain("一個立體的長闊高分別是3cm、3cm、5cm");
    expect(parent).toMatch(/思路：.+[。．.！？!?]/);
  });
});
