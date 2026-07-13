import { expect, test } from "@playwright/test";

test.describe("Home login smoke", () => {
  test("renders critical login sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("請輸入電話號碼及密碼登入")).toBeVisible();
    await expect(page.getByText("平台簡介")).toBeVisible();
    await expect(page.getByText("常見問題")).toBeVisible();
    await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WeChat" })).toBeVisible();
  });

  test("register screen marks gender as mandatory", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "新用戶註冊" }).click();
    await expect(page.getByRole("heading", { name: "新用戶註冊" })).toBeVisible();
    await expect(page.getByText("姓別")).toBeVisible();
  });
});
