import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildStampProgramSettingsPayload,
  classifyGiftCodeImport,
  computeStampRedemptionReportTotals,
  isMissingStampInventoryTableError,
  mapRedemptionRowForReport,
  parseGiftCodeCsv,
  STAMP_INVENTORY_TABLE_HINT,
  type StampGiftInventoryRow,
  type StampGiftStatus,
  type StampProgramSettingsPayload,
  type StampRedemptionReportRow,
} from "@/lib/admin-stamp-card";
const STAMP_SETTINGS_HINT =
  "缺少印花計劃設定資料表，請先在 Supabase 執行 supabase_practice_stamp_card_phase1.sql。";

function throwIfMissing(err: { message?: string } | null): void {
  if (!err) return;
  const msg = err.message ?? String(err);
  if (isMissingStampInventoryTableError(msg)) {
    throw new Error(STAMP_INVENTORY_TABLE_HINT);
  }
  throw new Error(msg);
}

export async function adminStampProgramSettingsGet(
  admin: SupabaseClient
): Promise<StampProgramSettingsPayload> {
  const { data: settings, error: settingsErr } = await admin
    .from("stamp_program_settings")
    .select("stamps_program_open")
    .eq("id", 1)
    .maybeSingle();
  if (settingsErr) {
    const msg = settingsErr.message ?? "";
    if (/stamp_program_settings|42P01|PGRST205|does not exist/i.test(msg)) {
      return { stamps_program_open: true, audit: null, error: STAMP_SETTINGS_HINT };
    }
    throw new Error(msg);
  }

  const { data: auditRows, error: auditErr } = await admin
    .from("stamp_program_settings_audit")
    .select("toggled_at, admin_identifier")
    .eq("setting_key", "stamps_program_open")
    .order("toggled_at", { ascending: false })
    .limit(1);
  if (auditErr) {
    const msg = auditErr.message ?? "";
    if (/stamp_program_settings_audit|42P01|PGRST205|does not exist/i.test(msg)) {
      return {
        stamps_program_open: Boolean(settings?.stamps_program_open ?? true),
        audit: null,
        error: STAMP_SETTINGS_HINT,
      };
    }
    throw new Error(msg);
  }

  return buildStampProgramSettingsPayload({
    open: Boolean(settings?.stamps_program_open ?? true),
    auditRow: auditRows?.[0]
      ? {
          toggled_at: String(auditRows[0].toggled_at),
          admin_identifier: String(auditRows[0].admin_identifier ?? "admin"),
        }
      : null,
  });
}

export async function adminStampProgramSetOpen(
  admin: SupabaseClient,
  open: boolean,
  adminIdentifier: string
): Promise<StampProgramSettingsPayload> {
  const { error } = await admin.rpc("stamp_program_set_open", {
    p_open: open,
    p_admin_identifier: adminIdentifier,
  });
  if (error) {
    const msg = error.message ?? "";
    if (/stamp_program|42883|PGRST202|does not exist/i.test(msg)) {
      throw new Error(STAMP_SETTINGS_HINT);
    }
    throw new Error(msg);
  }
  return adminStampProgramSettingsGet(admin);
}

type RawGiftRow = {
  id: string;
  name_tc: string;
  face_value_hkd: number;
  window_start_hkt: string;
  window_end_hkt: string;
  status: string;
  image_url: string | null;
};

async function loadGiftCodeCounts(
  admin: SupabaseClient,
  giftIds: string[]
): Promise<Map<string, { total: number; unused: number; used: number }>> {
  const map = new Map<string, { total: number; unused: number; used: number }>();
  if (giftIds.length === 0) return map;

  const { data, error } = await admin
    .from("stamp_gift_codes")
    .select("gift_id, status")
    .in("gift_id", giftIds);
  throwIfMissing(error);

  for (const row of data ?? []) {
    const giftId = String(row.gift_id);
    const entry = map.get(giftId) ?? { total: 0, unused: 0, used: 0 };
    entry.total += 1;
    if (row.status === "used") entry.used += 1;
    else entry.unused += 1;
    map.set(giftId, entry);
  }
  return map;
}

function toInventoryRow(
  gift: RawGiftRow,
  counts: { total: number; unused: number; used: number }
): StampGiftInventoryRow {
  return {
    id: gift.id,
    name_tc: gift.name_tc,
    face_value_hkd: Number(gift.face_value_hkd) || 0,
    window_start_hkt: gift.window_start_hkt,
    window_end_hkt: gift.window_end_hkt,
    status: gift.status === "listed" ? "listed" : "unlisted",
    image_url: gift.image_url,
    code_total: counts.total,
    code_unused: counts.unused,
    code_used: counts.used,
  };
}

export async function adminStampGiftList(admin: SupabaseClient): Promise<StampGiftInventoryRow[]> {
  const { data, error } = await admin
    .from("stamp_gifts")
    .select("id,name_tc,face_value_hkd,window_start_hkt,window_end_hkt,status,image_url")
    .order("created_at", { ascending: false });
  throwIfMissing(error);

  const gifts = (data ?? []) as RawGiftRow[];
  const counts = await loadGiftCodeCounts(
    admin,
    gifts.map((g) => g.id)
  );
  return gifts.map((g) => toInventoryRow(g, counts.get(g.id) ?? { total: 0, unused: 0, used: 0 }));
}

function parseHktDate(raw: unknown, fieldLabel: string): string {
  const text = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldLabel}格式無效（請用 YYYY-MM-DD）`);
  }
  return text;
}

export async function adminStampGiftCreate(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<StampGiftInventoryRow> {
  const nameTc = String(payload.name_tc ?? "").trim();
  const faceValue = Number(payload.face_value_hkd);
  const windowStart = parseHktDate(payload.window_start_hkt, "換領窗口開始");
  const windowEnd = parseHktDate(payload.window_end_hkt, "換領窗口結束");
  const statusRaw = String(payload.status ?? "unlisted").trim();
  const status: StampGiftStatus = statusRaw === "listed" ? "listed" : "unlisted";
  const imageUrl = String(payload.image_url ?? "").trim() || null;

  if (!nameTc) throw new Error("請輸入禮品名稱");
  if (!Number.isFinite(faceValue) || faceValue < 0) {
    throw new Error("面值必須為 0 或正整數");
  }
  if (windowEnd < windowStart) throw new Error("換領窗口結束日期不可早於開始日期");

  const { data, error } = await admin
    .from("stamp_gifts")
    .insert({
      name_tc: nameTc,
      face_value_hkd: Math.floor(faceValue),
      window_start_hkt: windowStart,
      window_end_hkt: windowEnd,
      status,
      image_url: imageUrl,
    })
    .select("id,name_tc,face_value_hkd,window_start_hkt,window_end_hkt,status,image_url")
    .single();
  throwIfMissing(error);
  return toInventoryRow(data as RawGiftRow, { total: 0, unused: 0, used: 0 });
}

export async function adminStampGiftUpdate(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<StampGiftInventoryRow> {
  const id = String(payload.id ?? "").trim();
  if (!id) throw new Error("缺少禮品 id");

  const patch: Record<string, unknown> = {};
  if (payload.name_tc !== undefined) {
    const nameTc = String(payload.name_tc).trim();
    if (!nameTc) throw new Error("請輸入禮品名稱");
    patch.name_tc = nameTc;
  }
  if (payload.face_value_hkd !== undefined) {
    const faceValue = Number(payload.face_value_hkd);
    if (!Number.isFinite(faceValue) || faceValue < 0) {
      throw new Error("面值必須為 0 或正整數");
    }
    patch.face_value_hkd = Math.floor(faceValue);
  }
  if (payload.window_start_hkt !== undefined) {
    patch.window_start_hkt = parseHktDate(payload.window_start_hkt, "換領窗口開始");
  }
  if (payload.window_end_hkt !== undefined) {
    patch.window_end_hkt = parseHktDate(payload.window_end_hkt, "換領窗口結束");
  }
  if (payload.status !== undefined) {
    patch.status = String(payload.status).trim() === "listed" ? "listed" : "unlisted";
  }
  if (payload.image_url !== undefined) {
    const imageUrl = String(payload.image_url ?? "").trim();
    patch.image_url = imageUrl || null;
  }

  const { data, error } = await admin
    .from("stamp_gifts")
    .update(patch)
    .eq("id", id)
    .select("id,name_tc,face_value_hkd,window_start_hkt,window_end_hkt,status,image_url")
    .single();
  throwIfMissing(error);

  const counts = await loadGiftCodeCounts(admin, [id]);
  return toInventoryRow(data as RawGiftRow, counts.get(id) ?? { total: 0, unused: 0, used: 0 });
}

export async function adminStampGiftCodesImport(
  admin: SupabaseClient,
  payload: Record<string, unknown>
) {
  const giftId = String(payload.gift_id ?? "").trim();
  const csvText = String(payload.csv_text ?? "");
  if (!giftId) throw new Error("缺少禮品 id");
  if (!csvText.trim()) throw new Error("請上傳 CSV 內容");

  const { data: existingRows, error: existingErr } = await admin
    .from("stamp_gift_codes")
    .select("code");
  throwIfMissing(existingErr);
  const existing = new Set((existingRows ?? []).map((r) => String(r.code)));

  const parsed = parseGiftCodeCsv(csvText);
  const summary = classifyGiftCodeImport(parsed.codes, parsed.failed, existing);
  const toInsert: { gift_id: string; code: string; status: string }[] = [];
  const seen = new Set<string>();
  for (const code of parsed.codes) {
    if (seen.has(code) || existing.has(code)) continue;
    seen.add(code);
    toInsert.push({ gift_id: giftId, code, status: "unused" });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await admin.from("stamp_gift_codes").insert(toInsert);
    throwIfMissing(insertErr);
  }

  return summary;
}

export async function adminStampGiftCodesExport(
  admin: SupabaseClient,
  payload: Record<string, unknown>
) {
  const giftId = String(payload.gift_id ?? "").trim();
  const scope = String(payload.scope ?? "unused").trim();
  if (!giftId) throw new Error("缺少禮品 id");

  let query = admin
    .from("stamp_gift_codes")
    .select("code, status, used_at")
    .eq("gift_id", giftId)
    .order("created_at", { ascending: true });
  if (scope === "unused") {
    query = query.eq("status", "unused");
  }
  const { data, error } = await query;
  throwIfMissing(error);

  const rows = (data ?? []).map((row) => ({
    code: String(row.code),
    status: String(row.status),
    used_at: row.used_at ? String(row.used_at) : null,
  }));
  return { rows, scope: scope === "all" ? "all" : "unused" };
}

function hktDateRangeToUtc(startHkt: string, endHkt: string): { startIso: string; endIso: string } {
  const HKT_OFFSET_MS = 8 * 60 * 60 * 1000;
  const [sy, sm, sd] = startHkt.split("-").map(Number);
  const [ey, em, ed] = endHkt.split("-").map(Number);
  const startUtcMs = Date.UTC(sy, sm - 1, sd) - HKT_OFFSET_MS;
  const endUtcMs = Date.UTC(ey, em - 1, ed + 1) - HKT_OFFSET_MS;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

export async function adminStampRedemptionReport(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ rows: StampRedemptionReportRow[]; totals: ReturnType<typeof computeStampRedemptionReportTotals> }> {
  const giftId = String(payload.gift_id ?? "").trim();
  const emailFilter = String(payload.email_status ?? "all").trim();
  const startHkt = String(payload.start_hkt ?? "").trim();
  const endHkt = String(payload.end_hkt ?? "").trim();

  let query = admin
    .from("student_stamp_redemptions")
    .select(
      `
      id,
      redeemed_at,
      gift_name,
      face_value_hkd,
      ecoupon_code,
      email_sent_at,
      email_status,
      admin_actor,
      gift_id,
      students!inner (
        parent_id,
        parents!inner (
          mobile_number
        )
      )
    `
    )
    .order("redeemed_at", { ascending: false })
    .limit(2000);

  if (giftId) query = query.eq("gift_id", giftId);
  if (emailFilter === "sent") query = query.eq("email_status", "sent");
  if (emailFilter === "failed") query = query.eq("email_status", "failed");

  if (startHkt && endHkt && /^\d{4}-\d{2}-\d{2}$/.test(startHkt) && /^\d{4}-\d{2}-\d{2}$/.test(endHkt)) {
    const range = hktDateRangeToUtc(startHkt, endHkt);
    query = query.gte("redeemed_at", range.startIso).lt("redeemed_at", range.endIso);
  }

  const { data, error } = await query;
  if (error) {
    const msg = error.message ?? "";
    if (/student_stamp_redemptions|42P01|PGRST205|does not exist/i.test(msg)) {
      throw new Error(STAMP_SETTINGS_HINT);
    }
    throw new Error(msg);
  }

  const rows: StampRedemptionReportRow[] = (data ?? []).map((row) => {
    const students = row.students as
      | { parents?: { mobile_number?: string | null } | { mobile_number?: string | null }[] }
      | { parents?: { mobile_number?: string | null } | { mobile_number?: string | null }[] }[]
      | null;
    let mobile: string | null = null;
    const studentNode = Array.isArray(students) ? students[0] : students;
    const parentsNode = studentNode?.parents;
    const parent = Array.isArray(parentsNode) ? parentsNode[0] : parentsNode;
    mobile = parent?.mobile_number ?? null;

    return mapRedemptionRowForReport({
      id: String(row.id),
      redeemed_at: String(row.redeemed_at),
      gift_name: row.gift_name ? String(row.gift_name) : null,
      face_value_hkd:
        row.face_value_hkd === null || row.face_value_hkd === undefined
          ? null
          : Number(row.face_value_hkd),
      ecoupon_code: row.ecoupon_code ? String(row.ecoupon_code) : null,
      email_sent_at: row.email_sent_at ? String(row.email_sent_at) : null,
      email_status: row.email_status ? String(row.email_status) : null,
      admin_actor: row.admin_actor ? String(row.admin_actor) : null,
      mobile_number: mobile,
    });
  });

  return { rows, totals: computeStampRedemptionReportTotals(rows) };
}
