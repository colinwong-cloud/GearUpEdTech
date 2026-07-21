import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

function readSource(relativePath: string): string {
  const absolutePath = path.resolve(process.cwd(), relativePath);
  return readFileSync(absolutePath, "utf8");
}

describe("anti-missing regressions", () => {
  it("keeps admin MTD parent questions summary section", () => {
    const businessKpiSource = readSource("src/app/admin/business-kpi.tsx");
    expect(businessKpiSource).toContain("學生練習摘要");
    expect(businessKpiSource).toContain("本月練習題數分佈（按家長）");
    expect(businessKpiSource).toContain("const [mtdParentQuestionsExpanded, setMtdParentQuestionsExpanded] = useState(true)");
    expect(businessKpiSource).toContain("\"mtd_parent_questions_summary\"");
    expect(businessKpiSource).toContain("序號");
    expect(businessKpiSource).toContain("家長電話");
    expect(businessKpiSource).toContain("MTD 練習題數");

    const adminConsoleApiSource = readSource("src/app/api/admin/console/route.ts");
    expect(adminConsoleApiSource).toContain("\"mtd_parent_questions_summary\"");
    expect(adminConsoleApiSource).toContain("getHktMonthToDateRangeIso");
    expect(adminConsoleApiSource).toContain("b.total_questions - a.total_questions");
  });
});
