import { expect, test } from "@playwright/test";

test.describe("Guoyu compose smoke", () => {
  test("compose landing renders when student resume is present", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "gearup_guoyu_student_resume_v1",
        JSON.stringify({
          mobileNumber: "99999999",
          selectedStudentId: "00000000-0000-4000-8000-000000000001",
          students: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              parent_id: "00000000-0000-4000-8000-000000000002",
              student_name: "測試",
              avatar_style: "default",
              grade_level: "P1",
              created_at: "2026-01-01T00:00:00.000Z",
            },
          ],
          parentTier: {
            tier: "free",
            is_paid: false,
            paid_until: null,
            tier_label: "免費用戶",
          },
          returnScreen: "subject_select",
        })
      );
    });

    await page.goto("/guoyu");
    await expect(page.getByRole("heading", { name: "練習國語拼音" })).toBeVisible();
    await expect(page.getByRole("button", { name: "生成練習" })).toBeVisible();
    await expect(page.getByText("使用方法：").first()).toBeVisible();
  });
});
