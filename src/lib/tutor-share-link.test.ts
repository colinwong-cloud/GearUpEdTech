import { describe, expect, it } from "vitest";
import {
  buildTutorShareUrl,
  buildTutorWhatsAppText,
  readTutorCodeFromSearch,
} from "./tutor-share-link";

describe("tutor share link", () => {
  it("builds one homepage link per tutor code", () => {
    expect(buildTutorShareUrl("112233")).toBe("https://www.gearupquiz.com/?tutor=112233");
  });

  it("reads only a 6-digit tutor code from the main-page link", () => {
    expect(readTutorCodeFromSearch("?tutor=112233")).toBe("112233");
    expect(readTutorCodeFromSearch("tutor=112233&utm_source=whatsapp")).toBe("112233");
    expect(readTutorCodeFromSearch("?tutor=11223")).toBe("");
    expect(readTutorCodeFromSearch("?tutor=abcdef")).toBe("");
    expect(readTutorCodeFromSearch("")).toBe("");
  });

  it("puts the registration link first so WhatsApp can show the GearUp preview", () => {
    const text = buildTutorWhatsAppText("112233");
    expect(text.startsWith("https://www.gearupquiz.com/?tutor=112233\n")).toBe(true);
    expect(text).toContain("請按此連結登記增分寶，登記時會自動填上我的教師編號。");
  });
});
