import { expect, test } from "@playwright/test";

test.describe("Home login smoke", () => {
  test("renders critical login sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("請輸入電話號碼及密碼登入")).toBeVisible();
    await expect(page.getByText("平台簡介")).toBeVisible();
    await expect(page.getByText("常見問題")).toBeVisible();
    await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WeChat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "接受全部" })).toBeVisible();
  });

  test("does not render cookie controls on reset-password page", async ({ page }) => {
    await page.goto("/reset-password");

    await expect(page.getByText("Cookie 設定")).toHaveCount(0);
    await expect(page.getByText("接受全部")).toHaveCount(0);
  });
});
