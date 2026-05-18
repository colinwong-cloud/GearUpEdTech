import { expect, test } from "@playwright/test";

const ADMIN_USER = process.env.ADMIN_CONSOLE_USER || "ci-admin";
const ADMIN_PASS = process.env.ADMIN_CONSOLE_PASS || "ci-pass";

test.describe("Admin smoke", () => {
  test("admin login reveals all required tabs", async ({ page }) => {
    await page.goto("/admin");

    await page.getByPlaceholder("帳號").fill(ADMIN_USER);
    await page.getByPlaceholder("密碼").fill(ADMIN_PASS);
    await page.getByRole("button", { name: "登入" }).click();

    await expect(page.getByRole("button", { name: "業務概覽" })).toBeVisible();
    await expect(page.getByRole("button", { name: "題目配額" })).toBeVisible();
    await expect(page.getByRole("button", { name: "刪除帳戶" })).toBeVisible();
    await expect(page.getByRole("button", { name: "電郵通知" })).toBeVisible();
    await expect(page.getByRole("button", { name: "題目管理" })).toBeVisible();
    await expect(page.getByRole("button", { name: "付款狀態查詢" })).toBeVisible();
    await expect(page.getByRole("button", { name: "折扣碼維護" })).toBeVisible();
  });
});
