import { describe, expect, it, vi } from "vitest";
import {
  formatStampRedeemEmailPlainBody,
  mapStampRedeemReasonToClientError,
  parseStampRedeemRpcResult,
} from "@/lib/server/practice-stamp-redeem";
import { GROWTH_STAMP_COPY } from "@/lib/practice-stamp-card-ui";

describe("parseStampRedeemRpcResult", () => {
  it("parses successful redeem payload", () => {
    const parsed = parseStampRedeemRpcResult({
      ok: true,
      redemption_id: "rid-1",
      coupon_code: "GU-ABC",
      gift_name: "測試禮券",
      face_value_hkd: 50,
      redeem_date_hkt: "2026-10-28",
      parent_email: "parent@example.com",
    });
    expect(parsed?.ok).toBe(true);
    if (parsed?.ok) {
      expect(parsed.coupon_code).toBe("GU-ABC");
      expect(parsed.face_value_hkd).toBe(50);
    }
  });

  it("maps failure reasons for the client", () => {
    expect(mapStampRedeemReasonToClientError("window_closed")).toBe("window_closed");
    expect(mapStampRedeemReasonToClientError("out_of_stock")).toBe("out_of_stock");
    expect(parseStampRedeemRpcResult({ ok: false, reason: "streak_incomplete" })?.reason).toBe(
      "streak_incomplete"
    );
  });
});

describe("stamp redeem Growth email copy", () => {
  it("uses locked TC subject and body placeholders", () => {
    expect(GROWTH_STAMP_COPY.emailSubject).toBe("GearUp Quiz｜你的練習獎賞電子禮券");
    const body = formatStampRedeemEmailPlainBody("禮品A", 100, "CODE1", "2026-10-28");
    expect(body).toBe(GROWTH_STAMP_COPY.emailBody("禮品A", 100, "CODE1", "2026-10-28"));
    expect(body).toContain("HK$100");
    expect(body).toContain("CODE1");
    expect(body).toContain("cs@gearupquiz.com");
  });
});

describe("sendPracticeStampRedeemEmail", () => {
  it("returns missing key when RESEND_API_KEY unset", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendPracticeStampRedeemEmail } = await import("@/lib/server/practice-stamp-redeem");
    const result = await sendPracticeStampRedeemEmail({
      to: "a@b.com",
      giftName: "G",
      faceValueHkd: 1,
      couponCode: "C",
      redeemDateHkt: "2026-01-01",
    });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("missing_resend_api_key");
    vi.unstubAllEnvs();
  });
});
