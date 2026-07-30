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

  it("keeps student registration CTA placement and tutor referral field", () => {
    const pageSource = readSource("src/app/page.tsx");
    expect(pageSource).toContain(
      "mb-4 w-full p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 text-base font-semibold text-indigo-700"
    );
    expect(pageSource).toContain("負責教師編號（選填）");
    expect(pageSource).toContain("referralCode");
    expect(pageSource).toContain("fetch(\"/api/auth/register\"");

    const registerApiSource = readSource("src/app/api/auth/register/route.ts");
    expect(registerApiSource).toContain("tutor_referral_usages");
    expect(registerApiSource).toContain("REFERRAL_CODE_RE");
  });

  it("keeps paid-user payment history entry and API", () => {
    const pageSource = readSource("src/app/page.tsx");
    expect(pageSource).toContain("\"payment_history\"");
    expect(pageSource).toContain("onPaymentHistory");
    expect(pageSource).toContain("消費紀錄");
    expect(pageSource).toContain("查看付款日期、金額及付款方式");
    expect(pageSource).toContain("fetch(\"/api/payment/history\"");

    const paymentHistoryApiSource = readSource("src/app/api/payment/history/route.ts");
    expect(paymentHistoryApiSource).toContain("get_parent_tier_status");
    expect(paymentHistoryApiSource).toContain("parent_payment_orders");
    expect(paymentHistoryApiSource).toContain("目前僅限月費用戶查看消費紀錄");
  });

  it("keeps login enquiry email as cs@gearupquiz.com", () => {
    const pageSource = readSource("src/app/page.tsx");
    expect(pageSource).toContain("有問題或意見？歡迎電郵至");
    expect(pageSource).toContain('href="mailto:cs@gearupquiz.com"');
    expect(pageSource).toContain("cs@gearupquiz.com");
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
    expect(tutorPageSource).toContain("GearUp Tutor");
    expect(tutorPageSource).toContain("導師登入");
    expect(tutorPageSource).toContain("首次登入請更新密碼");
    expect(tutorPageSource).toContain("bg-slate-950");
    expect(tutorPageSource).toContain("rounded-xl border border-sky-200 bg-sky-100");

    const tutorDetailSource = readSource("src/app/tutor/student/[hash]/page.tsx");
    expect(tutorDetailSource).toContain("OverallChart");
    expect(tutorDetailSource).toContain("TypeCharts");
    expect(tutorDetailSource).toContain("各題型正確率趨勢");
    expect(tutorDetailSource).toContain("錯題解析");
    expect(tutorDetailSource).toContain("你的答案（含值）");

    const tutorSessionsApiSource = readSource("src/app/api/tutor/sessions/route.ts");
    expect(tutorSessionsApiSource).toContain("get_student_chart_data");

    const tutorHashSource = readSource("src/lib/server/tutor-student-hash.ts");
    expect(tutorHashSource).toContain("computeTutorStudentHash");
    expect(tutorHashSource).toContain("getTutorHashSecret");
    expect(tutorHashSource).toContain("TUTOR_SESSION_SECRET");

    const adminPageSource = readSource("src/app/admin/page.tsx");
    expect(adminPageSource).toContain("教師編號維護");
    expect(adminPageSource).toContain("重設導師登入密碼");
    expect(adminPageSource).toContain("今日需發起 MIT");
    expect(adminPageSource).toContain("今日已發起 MIT");
    expect(adminPageSource).toContain("今日練習明細");
    expect(adminPageSource).toContain("今日練習時間");
    expect(adminPageSource).toContain("家長電話");
    expect(adminPageSource).toContain("練習科目");
    expect(adminPageSource).toContain("練習題數");
    expect(adminPageSource).toContain("本月練習題數分佈（按家長）");
    expect(adminPageSource).toContain("const [mtdQuestionsExpanded, setMtdQuestionsExpanded] = useState(true)");
    expect(adminPageSource).toContain("序號");
    expect(adminPageSource).toContain("MTD 練習題數");

    const adminApiSource = readSource("src/app/api/admin/console/route.ts");
    expect(adminApiSource).toContain("tutor_referral_code_create");
    expect(adminApiSource).toContain("tutor_referral_code_summary");
    expect(adminApiSource).toContain("tutor_referral_password_reset");
    expect(adminApiSource).toContain("payment_recurring_monitor_summary");
    expect(adminApiSource).toContain("today_practice_details_summary");
    expect(adminApiSource).toContain("mtd_parent_questions_summary");
  });

  it("keeps quiz star progress LTR grid so grey stars trail after yellow", () => {
    const quizUiSource = readSource("src/components/student-quiz-experience.tsx");
    expect(quizUiSource).toContain('STAR_PROGRESS_POLICY_VERSION = "quiz-star-progress-ltr-grid-v1"');
    expect(quizUiSource).toContain("STAR_PROGRESS_COLUMNS = 10");
    expect(quizUiSource).toContain("[anti-missing][quiz][star-progress]");
    expect(quizUiSource).toContain(
      "gridTemplateColumns: `repeat(${STAR_PROGRESS_COLUMNS}, minmax(0, 1fr))`"
    );
    expect(quizUiSource).toContain("data-star-progress-policy={STAR_PROGRESS_POLICY_VERSION}");
    expect(quizUiSource).not.toContain("flex flex-wrap items-center justify-center gap-1.5");
  });

  it("keeps release SOP fresh-branch safety rule", () => {
    const releaseSopSource = readSource("docs/release-sop.md");
    expect(releaseSopSource).toContain("create a fresh branch **for every new task**");
    expect(releaseSopSource).toContain("git checkout -b cursor/<task-name>-2d42 origin/main");
  });
});

