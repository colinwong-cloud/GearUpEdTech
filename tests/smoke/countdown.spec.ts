import { expect, test } from "@playwright/test";

test.describe("Voice countdown page", () => {
  test("serves the standalone timer at /countdown", async ({ page }) => {
    await page.goto("/countdown");

    await expect(page).toHaveTitle("Voice Countdown Timer");
    await expect(page.getByRole("heading", { name: "Voice Countdown Timer" })).toBeVisible();
    await expect(page.locator("#display")).toHaveText("30");
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  });

  test("counts down and stop restores the entered seconds", async ({ page }) => {
    await page.goto("/countdown");

    await page.locator("#timeInput").fill("8");
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.locator("#display")).toHaveText("7", { timeout: 2_500 });

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.locator("#display")).toHaveText("8");
  });

  test("character preset updates the pitch control", async ({ page }) => {
    await page.goto("/countdown");

    await page.locator("#personaSelect").selectOption("sweetGirl");
    await expect(page.locator("#pitchVal")).toHaveText("1.7");
    await expect(page.locator("#pitchInput")).toHaveValue("1.7");
  });
});
