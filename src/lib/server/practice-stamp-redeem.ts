import type { SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { GROWTH_STAMP_COPY } from "@/lib/practice-stamp-card-ui";

export type StampRedeemRpcSuccess = {
  ok: true;
  redemption_id: string;
  coupon_code: string;
  gift_name: string;
  face_value_hkd: number;
  redeem_date_hkt: string;
  parent_email: string | null;
  window_end_hkt?: string | null;
};

export type StampRedeemRpcFailure = {
  ok: false;
  reason: string;
};

export type StampRedeemRpcResult = StampRedeemRpcSuccess | StampRedeemRpcFailure;

export function parseStampRedeemRpcResult(data: unknown): StampRedeemRpcResult | null {
  if (!data || typeof data !== "object") return null;
  const row = data as Record<string, unknown>;
  if (row.ok !== true) {
    const reason = typeof row.reason === "string" ? row.reason : "redeem_failed";
    return { ok: false, reason };
  }
  const redemption_id = typeof row.redemption_id === "string" ? row.redemption_id : "";
  const coupon_code = typeof row.coupon_code === "string" ? row.coupon_code : "";
  const gift_name = typeof row.gift_name === "string" ? row.gift_name : "";
  const face_value_hkd =
    typeof row.face_value_hkd === "number" && Number.isFinite(row.face_value_hkd)
      ? row.face_value_hkd
      : NaN;
  const redeem_date_hkt = typeof row.redeem_date_hkt === "string" ? row.redeem_date_hkt : "";
  if (!redemption_id || !coupon_code || !gift_name || !Number.isFinite(face_value_hkd)) {
    return { ok: false, reason: "invalid_rpc_payload" };
  }
  const parent_email =
    typeof row.parent_email === "string" && row.parent_email.trim()
      ? row.parent_email.trim()
      : null;
  return {
    ok: true,
    redemption_id,
    coupon_code,
    gift_name,
    face_value_hkd,
    redeem_date_hkt,
    parent_email,
    window_end_hkt: typeof row.window_end_hkt === "string" ? row.window_end_hkt : null,
  };
}

export function formatStampRedeemEmailPlainBody(
  giftName: string,
  faceValue: number,
  couponCode: string,
  redeemDateHkt: string
): string {
  return GROWTH_STAMP_COPY.emailBody(giftName, faceValue, couponCode, redeemDateHkt);
}

export function mapStampRedeemReasonToClientError(reason: string): string {
  switch (reason) {
    case "window_closed":
      return "window_closed";
    case "out_of_stock":
      return "out_of_stock";
    case "streak_incomplete":
    case "no_active_card":
      return "not_redeemable";
    default:
      return "redeem_failed";
  }
}

const STAMP_REDEEM_FROM = "GearUp Quiz <noreply@updates.hkedutech.com>";

export async function sendPracticeStampRedeemEmail(input: {
  to: string;
  giftName: string;
  faceValueHkd: number;
  couponCode: string;
  redeemDateHkt: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return { sent: false, error: "missing_resend_api_key" };
  }
  const resend = new Resend(apiKey);
  const text = formatStampRedeemEmailPlainBody(
    input.giftName,
    input.faceValueHkd,
    input.couponCode,
    input.redeemDateHkt
  );
  const { error } = await resend.emails.send({
    from: STAMP_REDEEM_FROM,
    to: input.to,
    subject: GROWTH_STAMP_COPY.emailSubject,
    text,
  });
  if (error) {
    return { sent: false, error: error.message || "send_failed" };
  }
  return { sent: true };
}

export async function finalizeStampRedeemEmailStatus(
  admin: SupabaseClient,
  redemptionId: string,
  sent: boolean
): Promise<void> {
  const email_status = sent ? "sent" : "failed";
  const patch: Record<string, unknown> = { email_status };
  if (sent) {
    patch.email_sent_at = new Date().toISOString();
  }
  await admin.from("student_stamp_redemptions").update(patch).eq("id", redemptionId);
}

export async function executePracticeStampRedeem(
  admin: SupabaseClient,
  studentId: string
): Promise<{
  ok: boolean;
  couponCode?: string;
  giftName?: string;
  faceValueHkd?: number;
  emailSent?: boolean;
  error?: string;
}> {
  const { data, error } = await admin.rpc("redeem_student_practice_stamp", {
    p_student_id: studentId,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/redeem_student_practice_stamp|42883|PGRST202|does not exist/i.test(msg)) {
      return { ok: false, error: "redeem_rpc_not_deployed" };
    }
    return { ok: false, error: "redeem_failed" };
  }

  const parsed = parseStampRedeemRpcResult(data);
  if (!parsed || !parsed.ok) {
    return {
      ok: false,
      error: mapStampRedeemReasonToClientError(parsed?.reason ?? "redeem_failed"),
    };
  }

  let emailSent = false;
  if (parsed.parent_email) {
    const sendResult = await sendPracticeStampRedeemEmail({
      to: parsed.parent_email,
      giftName: parsed.gift_name,
      faceValueHkd: parsed.face_value_hkd,
      couponCode: parsed.coupon_code,
      redeemDateHkt: parsed.redeem_date_hkt,
    });
    emailSent = sendResult.sent;
    await finalizeStampRedeemEmailStatus(admin, parsed.redemption_id, emailSent);
  } else {
    await finalizeStampRedeemEmailStatus(admin, parsed.redemption_id, false);
  }

  return {
    ok: true,
    couponCode: parsed.coupon_code,
    giftName: parsed.gift_name,
    faceValueHkd: parsed.face_value_hkd,
    emailSent,
  };
}
