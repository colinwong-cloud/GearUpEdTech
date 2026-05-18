export interface PaidTransactionAuditRow {
  id: string;
  mobile_number: string;
  parent_name: string | null;
  merchant_order_id: string;
  status: string;
  paid_at: string | null;
  created_at: string;
  final_amount_hkd: number;
  payment_method: string | null;
  is_recurring_payment: boolean;
  airwallex_payment_intent_id: string | null;
  airwallex_payment_attempt_id: string | null;
}

export function isValidMonthKey(month: string): boolean {
  return /^\d{4}-\d{2}$/.test(month);
}

export function getCurrentHktMonthKey(now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function getHktMonthRangeIso(month: string): {
  startIso: string;
  endIso: string;
} {
  if (!isValidMonthKey(month)) {
    throw new Error("月份格式必須為 YYYY-MM");
  }
  const [yearRaw, monthRaw] = month.split("-");
  const year = Number(yearRaw);
  const monthNum = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) {
    throw new Error("月份格式必須為 YYYY-MM");
  }

  const hktOffsetMs = 8 * 60 * 60 * 1000;
  const startUtcMs = Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0) - hktOffsetMs;
  const endUtcMs = Date.UTC(year, monthNum, 1, 0, 0, 0, 0) - hktOffsetMs;
  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

function escapeCsvValue(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildPaidTransactionsCsv(rows: PaidTransactionAuditRow[]): string {
  const headers = [
    "id",
    "mobile_number",
    "parent_name",
    "merchant_order_id",
    "status",
    "paid_at",
    "created_at",
    "final_amount_hkd",
    "payment_method",
    "is_recurring_payment",
    "airwallex_payment_intent_id",
    "airwallex_payment_attempt_id",
  ];
  const body = rows.map((row) =>
    [
      row.id,
      row.mobile_number,
      row.parent_name,
      row.merchant_order_id,
      row.status,
      row.paid_at,
      row.created_at,
      row.final_amount_hkd,
      row.payment_method,
      row.is_recurring_payment,
      row.airwallex_payment_intent_id,
      row.airwallex_payment_attempt_id,
    ]
      .map(escapeCsvValue)
      .join(",")
  );
  return [headers.join(","), ...body].join("\n");
}
