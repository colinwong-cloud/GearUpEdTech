import { expect, test } from "@playwright/test";

test.describe("Home login smoke", () => {
  test("renders critical login sections", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("請輸入電話號碼及密碼登入")).toBeVisible();
    await expect(page.getByRole("link", { name: "導師登入" })).toHaveAttribute(
      "href",
      "https://tutor.gearupquiz.com"
    );
    await expect(page.getByText("平台簡介")).toBeVisible();
    await expect(page.getByText("常見問題（FAQ）").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "WhatsApp" })).toBeVisible();
    await expect(page.getByRole("button", { name: "WeChat" })).toBeVisible();
    const countdownLink = page.getByRole("link", { name: "學習計時器" });
    await expect(countdownLink).toBeVisible();
    await expect(countdownLink).toHaveAttribute("href", "/countdown");
    await expect(page.getByRole("heading", { name: "關於我們" })).toBeVisible();
    await expect(page.getByText("如有問題或查詢，請電郵")).toBeVisible();
    const aboutMailLink = page.getByRole("link", { name: "cs@gearupquiz.com" }).last();
    await expect(aboutMailLink).toHaveAttribute("href", "mailto:cs@gearupquiz.com");
  });

  test("register screen marks gender as mandatory", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "新用戶註冊" }).click();
    await expect(page.getByRole("heading", { name: "新用戶註冊" })).toBeVisible();
    await expect(page.getByText("姓別")).toBeVisible();
  });
});
