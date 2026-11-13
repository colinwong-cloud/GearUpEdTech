import { test, expect } from "@playwright/test";

const resume = {
  mobileNumber: "90000001",
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
  selectedStudentId: "00000000-0000-4000-8000-000000000001",
  parentTier: {
    tier: "free" as const,
    is_paid: false,
    paid_until: null,
    tier_label: "免費",
  },
  returnScreen: "subject_select" as const,
};

test.describe("Zhongwen xiezuo smoke", () => {
  test("compose page shows generate and download PDF with 誇張 copy", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((payload) => {
      sessionStorage.setItem("gearup_guoyu_student_resume_v1", JSON.stringify(payload));
    }, resume);
    await page.goto("/zhongwen-xiezuo");
    await expect(page.getByRole("heading", { name: "中文寫作練習" })).toBeVisible();
    await expect(page.getByText("誇張")).toBeVisible();
    await expect(page.getByText("夸張")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "generate", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "download PDF", exact: true })).toBeVisible();
  });
});
