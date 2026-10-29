import { describe, expect, it } from "vitest";
import { parseHomePageNoticeAdminRow, parseHomePageNoticePublic } from "./home-page-notice";

describe("home page notice", () => {
  it("fail-closes when disabled or empty", () => {
    expect(parseHomePageNoticePublic(null).visible).toBe(false);
    expect(parseHomePageNoticePublic({ visible: false }).visible).toBe(false);
    expect(parseHomePageNoticePublic({ visible: true }).visible).toBe(false);
    expect(parseHomePageNoticePublic({ visible: true, body_text: "  " }).visible).toBe(false);
  });

  it("shows image and/or text when visible", () => {
    expect(
      parseHomePageNoticePublic({
        visible: true,
        body_text: "  活動通知  ",
        image_url: "https://example.com/poster.png",
        link_url: "https://example.com",
      })
    ).toEqual({
      visible: true,
      body_text: "活動通知",
      image_url: "https://example.com/poster.png",
      link_url: "https://example.com",
    });
  });

  it("parses admin row", () => {
    expect(
      parseHomePageNoticeAdminRow({
        enabled: true,
        body_text: "hello",
        image_url: null,
        link_url: "",
        updated_at: "2026-01-01T00:00:00Z",
      })
    ).toMatchObject({
      enabled: true,
      body_text: "hello",
      image_url: null,
      link_url: null,
    });
  });
});
