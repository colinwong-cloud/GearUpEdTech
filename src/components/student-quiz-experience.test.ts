import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("StudentQuizExperience (Soft #260)", () => {
  const source = readSource("src/components/student-quiz-experience.tsx");

  it("shows 上一題 / 下一題 / 完成 navigation without auto-advance", () => {
    expect(source).toContain("PRACTICE_NAV_PREV_LABEL");
    expect(source).toContain("PRACTICE_NAV_NEXT_LABEL");
    expect(source).toContain("PRACTICE_NAV_FINISH_LABEL");
    expect(source).toContain("PRACTICE_FINISH_DISABLED_REASON");
    expect(source).not.toContain("提交並查看結果");
  });

  it("highlights selected MCQ with bold primary border", () => {
    expect(source).toContain("selected={selectedMcqOption === label}");
    expect(source).toContain("border-indigo-600");
  });

  it("uses per-question star progress (Soft #263)", () => {
    expect(source).toContain("quiz-star-per-question-v3");
    expect(source).toContain("buildQuestionProgressMarkers");
    expect(source).toContain("data-star-progress-interactive=\"false\"");
    expect(source).toContain("practiceVisited: Record<number, boolean>");
    const starBlock = source.slice(
      source.indexOf("function StarProgress"),
      source.indexOf("function OptionButton")
    );
    expect(starBlock).not.toContain("onClick");
    expect(starBlock).not.toContain("<button");
  });
});

describe("QuestionCountScreen (Soft #260)", () => {
  const pageSource = readSource("src/app/page.tsx");

  it("collapses question types by default with expand control", () => {
    expect(pageSource).toContain("typesSectionExpanded");
    expect(pageSource).toContain(
      "const [typesSectionExpanded, setTypesSectionExpanded] = useState(false)"
    );
    expect(pageSource).toContain("summarizeCollapsedQuestionTypes");
    expect(pageSource).toContain("aria-expanded={typesSectionExpanded}");
  });
});