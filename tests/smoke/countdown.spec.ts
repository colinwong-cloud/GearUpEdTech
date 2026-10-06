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
});
