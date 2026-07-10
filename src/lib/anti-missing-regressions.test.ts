import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(relPath: string): string {
  return readFileSync(resolve(process.cwd(), relPath), "utf8");
}

describe("anti-missing regression guards", () => {
  it("keeps results page wrong-answer details and action buttons", () => {
    const pageSource = readSource("src/app/page.tsx");
    expect(pageSource).toContain("錯題解析");
    expect(pageSource).toContain("你的答案（值）");
    expect(pageSource).toContain("正確答案（值）");
    expect(pageSource).toContain("再做一次");
    expect(pageSource).toContain("回到主畫面");
    expect(pageSource).toContain("px-8 py-3.5");
    expect(pageSource).toContain("bg-sky-500 text-white font-semibold rounded-xl");
    expect(pageSource).toContain("bg-white text-sky-700 font-semibold rounded-xl border border-sky-200");
    expect(pageSource).toContain("bg-sky-50 text-sky-700 font-semibold rounded-xl border border-sky-200");
    expect(pageSource).toContain("const handleBackToHome = () => {");
    expect(pageSource).toContain("setScreen(\"login_role\")");
    expect(pageSource).toContain("登出");
    expect(pageSource).toContain("fetch(\"/api/send-question-report\"");
  });

  it("keeps question-report notification API route", () => {
    const reportApiSource = readSource("src/app/api/send-question-report/route.ts");
    expect(reportApiSource).toContain("題目反映通知");
    expect(reportApiSource).toContain("QUESTION_REPORT_NOTIFY_EMAIL");
    expect(reportApiSource).toContain("GearUp Quiz <noreply@updates.hkedutech.com>");
  });

  it("keeps parent practice email readability and wrong-question details", () => {
    const emailSource = readSource("src/app/api/send-quiz-email/route.ts");
    expect(emailSource).toContain('meta name="x-apple-disable-message-reformatting"');
    expect(emailSource).toContain('meta name="color-scheme" content="light"');
    expect(emailSource).toContain("color-scheme: light only");
    expect(emailSource).toContain("老師給家長的練習小結");
    expect(emailSource).toContain("錯題詳解（錯題逐題詳解）");
    expect(emailSource).toContain("你的答案（值）");
    expect(emailSource).toContain("正確答案（值）");
    expect(emailSource).toContain("class=\"summary-text\"");
    expect(emailSource).toContain("font-size:17px;color:#111827;line-height:1.9");
    expect(emailSource).toContain("Keep up the great work! 繼續加油！ 💪");
  });

  it("keeps tutor portal and admin tutor+MIT modules", () => {
    const tutorPageSource = readSource("src/app/tutor/page.tsx");
    expect(tutorPageSource).toContain("導師入口");
    expect(tutorPageSource).toContain("使用教師編號登入");
    expect(tutorPageSource).toContain("首次登入請更新密碼");

    const adminPageSource = readSource("src/app/admin/page.tsx");
    expect(adminPageSource).toContain("教師編號維護");
    expect(adminPageSource).toContain("重設導師登入密碼");
    expect(adminPageSource).toContain("今日需發起 MIT");
    expect(adminPageSource).toContain("今日已發起 MIT");

    const adminApiSource = readSource("src/app/api/admin/console/route.ts");
    expect(adminApiSource).toContain("tutor_referral_code_create");
    expect(adminApiSource).toContain("tutor_referral_code_summary");
    expect(adminApiSource).toContain("tutor_referral_password_reset");
    expect(adminApiSource).toContain("payment_recurring_monitor_summary");
  });
});

