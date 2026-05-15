import { describe, expect, it } from "vitest";
import {
  createCookieConsentPreferences,
  parseCookieConsentPreferences,
} from "@/lib/cookie-consent";

describe("cookie-consent helpers", () => {
  it("creates preferences with required shape", () => {
    const consent = createCookieConsentPreferences(
      { analytics: true, advertising: false },
      "save_preferences"
    );
    expect(consent.necessary).toBe(true);
    expect(consent.analytics).toBe(true);
    expect(consent.advertising).toBe(false);
    expect(consent.action).toBe("save_preferences");
    expect(new Date(consent.updated_at).toString()).not.toBe("Invalid Date");
  });

  it("parses valid serialized preferences", () => {
    const raw = JSON.stringify({
      necessary: true,
      analytics: false,
      advertising: true,
      updated_at: "2026-05-15T00:00:00.000Z",
      action: "accept_all",
    });
    const parsed = parseCookieConsentPreferences(raw);
    expect(parsed).toEqual({
      necessary: true,
      analytics: false,
      advertising: true,
      updated_at: "2026-05-15T00:00:00.000Z",
      action: "accept_all",
    });
  });

  it("rejects invalid payloads", () => {
    expect(parseCookieConsentPreferences(null)).toBeNull();
    expect(parseCookieConsentPreferences("")).toBeNull();
    expect(parseCookieConsentPreferences("{bad json")).toBeNull();
    expect(
      parseCookieConsentPreferences(
        JSON.stringify({
          necessary: true,
          analytics: "yes",
          advertising: false,
          updated_at: "2026-05-15T00:00:00.000Z",
          action: "accept_all",
        })
      )
    ).toBeNull();
  });
});
