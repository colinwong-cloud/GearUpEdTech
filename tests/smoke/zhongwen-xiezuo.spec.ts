import { expect, test } from "@playwright/test";

test.describe("中文寫作 smoke", () => {
  test("compose page shows 產生 and 下載 PDF with 誇張 copy", async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "gearup_guoyu_student_resume_v1",
        JSON.stringify({
          mobileNumber: "90000001",
          selectedStudentId: "00000000-0000-4000-8000-000000000001",
          students: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              parent_id: "00000000-0000-4000-8000-000000009999",
              student_name: "測試",
              avatar_style: "default",
              grade_level: "P4",
              created_at: "2026-01-01T00:00:00Z",
            },
          ],
          parentTier: {
            tier: "free",
            is_paid: false,
            paid_until: null,
            tier_label: "免費",
          },
          returnScreen: "subject_select",
        })
      );
    });

    await page.goto("/zhongwen-xiezuo");
    await expect(page.getByRole("heading", { name: "中文寫作練習" })).toBeVisible();
    await expect(page.getByText("誇張")).toBeVisible();
    await expect(page.getByText("夸張")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "產生", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "下載 PDF", exact: true })).toBeVisible();
  });
});
