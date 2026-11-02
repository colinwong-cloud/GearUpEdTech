import { expect, test } from "@playwright/test";

test.describe("Voice countdown page", () => {
  test("serves the standalone timer at /countdown", async ({ page }) => {
    await page.goto("/countdown");

    await expect(page).toHaveTitle("語音倒數計時｜增分寶 GearUp Quiz");
    await expect(page.getByRole("heading", { name: "語音倒數計時" })).toBeVisible();
    await expect(page.locator("#display")).toHaveText("30");
    await expect(page.getByRole("button", { name: "開始" })).toBeVisible();
    await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  });

  test("counts down and stop restores the entered seconds", async ({ page }) => {
    await page.goto("/countdown");

    await page.locator("#timeInput").fill("8");
    await page.getByRole("button", { name: "開始" }).click();
    await expect(page.locator("#display")).toHaveText("7", { timeout: 2_500 });

    await page.getByRole("button", { name: "停止" }).click();
    await expect(page.locator("#display")).toHaveText("8");
  });

  test("lists browser languages and filters the voice base", async ({ page }) => {
    await page.addInitScript(() => {
      const voices = [
        { name: "Google US English", lang: "en-US", default: true, localService: true, voiceURI: "Google US English" },
        { name: "Google UK English Female", lang: "en-GB", default: false, localService: true, voiceURI: "Google UK English Female" },
        { name: "Google UK English Male", lang: "en-GB", default: false, localService: true, voiceURI: "Google UK English Male" },
        { name: "Google 粤語（香港）", lang: "zh-HK", default: false, localService: true, voiceURI: "Google 粤語（香港）" },
        { name: "Google 普通话（中国大陆）", lang: "zh-CN", default: false, localService: true, voiceURI: "Google 普通话（中国大陆）" },
      ];
      Object.defineProperty(window.speechSynthesis, "getVoices", {
        configurable: true,
        writable: true,
        value: () => voices,
      });
    });

    await page.goto("/countdown");

    const langSelect = page.locator("#langSelect");
    await expect(langSelect).toContainText("Cantonese (Hong Kong) (zh-HK)");
    await expect(langSelect).toContainText("Mandarin (Mainland China) (zh-CN)");
    await expect(langSelect).toHaveValue("all");
    await expect(page.locator("#voiceSelect")).toContainText("粤語");
    await expect(page.locator("#voiceSelect option")).toHaveCount(5);

    await langSelect.selectOption("zh-HK");
    await expect(page.locator("#voiceSelect option")).toHaveText("Google 粤語（香港） (zh-HK)");

    await langSelect.selectOption("en-GB");
    await expect(page.locator("#voiceSelect option")).toHaveCount(2);

    await langSelect.selectOption("all");
    await expect(page.locator("#voiceSelect option")).toHaveCount(5);
  });

  test("adds Cantonese when Chrome reports it after the first voice list", async ({ page }) => {
    await page.addInitScript(() => {
      let voices = [
        { name: "Google US English", lang: "en-US", default: true, localService: true, voiceURI: "Google US English" },
        { name: "Google UK English Female", lang: "en-GB", default: false, localService: true, voiceURI: "Google UK English Female" },
        { name: "Google UK English Male", lang: "en-GB", default: false, localService: true, voiceURI: "Google UK English Male" },
      ];
      Object.defineProperty(window.speechSynthesis, "getVoices", {
        configurable: true,
        value: () => voices,
      });
      window.__addCantonese = () => {
        voices = voices.concat([
          { name: "Google 粤語（香港）", lang: "zh-HK", default: false, localService: false, voiceURI: "Google 粤語（香港）" },
        ]);
        window.speechSynthesis.dispatchEvent(new Event("voiceschanged"));
      };
    });

    await page.goto("/countdown");
    await expect(page.locator("#voiceSelect")).not.toContainText("粤語");
    await page.evaluate(() => window.__addCantonese());
    await expect(page.locator("#voiceSelect")).toContainText("粤語");
    await expect(page.locator("#langSelect")).toContainText("Cantonese (Hong Kong) (zh-HK)");
  });

  test("character preset updates the pitch control", async ({ page }) => {
    await page.goto("/countdown");

    await page.locator("#personaSelect").selectOption("sweetGirl");
    await expect(page.locator("#pitchVal")).toHaveText("1.7");
    await expect(page.locator("#pitchInput")).toHaveValue("1.7");
  });

  test("marketing chrome matches GearUp brief", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/countdown");

    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
    await expect(page.locator('a.logo-link[href="/"] img[src="/main/gearup-quiz-logo.webp"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "返回主頁" })).toHaveAttribute("href", "/");
    await expect(page.getByText("© 2026 GearUp EduTech Limited")).toBeVisible();

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe("rgb(240, 249, 255)");

    const startBox = await page.getByRole("button", { name: "開始" }).boundingBox();
    const stopBox = await page.getByRole("button", { name: "停止" }).boundingBox();
    const testBox = await page.getByRole("button", { name: "試聽" }).boundingBox();
    expect(startBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(stopBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(testBox?.height ?? 0).toBeGreaterThanOrEqual(44);

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
});
