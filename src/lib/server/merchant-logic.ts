export const MERCHANT_COMPANY_NAME = "GearUp EduTech Limited";
export const MERCHANT_EMAIL_AUTOMATED_NOTE =
  "Note: This is an automated email. Please do not reply directly to this message. If you have any questions or need assistance, feel free to reach out to our customer support team at cs@gearupquiz.com. Thank you!";
export const MERCHANT_PAYMENT_TERMS = ["cash_with_order", "net_30", "net_60", "net_90", "blank"] as const;
export type MerchantPaymentTerm = (typeof MERCHANT_PAYMENT_TERMS)[number];
export type MerchantInvoiceStatus = "unpaid" | "paid";
export type MerchantEmailTemplate = "initial" | "overdue";
export const MERCHANT_SETTLEMENT_METHODS = ["cash", "cheque", "bank_transfer"] as const;
export type MerchantSettlementMethod = (typeof MERCHANT_SETTLEMENT_METHODS)[number];

export type MerchantLineInput = {
  description: string;
  qty: number;
  unitCost: number;
};

export type MerchantMoneyLine = MerchantLineInput & {
  amount: number;
};

const TERM_DAYS: Record<Exclude<MerchantPaymentTerm, "blank">, number> = {
  cash_with_order: 0,
  net_30: 30,
  net_60: 60,
  net_90: 90,
};

export function isMerchantPaymentTerm(value: string): value is MerchantPaymentTerm {
  return (MERCHANT_PAYMENT_TERMS as readonly string[]).includes(value);
}

export function paymentTermLabel(term: MerchantPaymentTerm): string {
  if (term === "cash_with_order") return "Cash with order";
  if (term === "net_30") return "Net 30";
  if (term === "net_60") return "Net 60";
  if (term === "net_90") return "Net 90";
  return "Leave blank";
}

export function isMerchantSettlementMethod(value: string): value is MerchantSettlementMethod {
  return (MERCHANT_SETTLEMENT_METHODS as readonly string[]).includes(value);
}

export function settlementMethodLabel(method: MerchantSettlementMethod): string {
  if (method === "cash") return "Cash";
  if (method === "cheque") return "Cheque";
  return "Bank transfer";
}

export function invoiceMatchesPaySearch(invoiceNumber: string, vendorName: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return invoiceNumber.toLowerCase().includes(needle) || vendorName.toLowerCase().includes(needle);
}

export function normalizePaidOn(value: string): string {
  const date = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Paid date is required");
  return date;
}

export function normalizeChequeNumber(method: MerchantSettlementMethod, chequeNumber: string): string {
  const number = chequeNumber.trim();
  if (method === "cheque" && !number) throw new Error("Cheque number is required");
  return method === "cheque" ? number : "";
}

export function formatHkDate(iso: string): string {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function dueDateForTerm(issueDateIso: string, term: MerchantPaymentTerm): string | null {
  if (term === "blank") return null;
  const issue = new Date(`${issueDateIso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(issue.getTime())) {
    throw new Error("Invalid invoice date");
  }
  issue.setUTCDate(issue.getUTCDate() + TERM_DAYS[term]);
  return issue.toISOString().slice(0, 10);
}

export function lineAmount(qty: number, unitCost: number): number {
  const amount = Number(qty) * Number(unitCost);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

export function normalizeLines(lines: MerchantLineInput[]): MerchantMoneyLine[] {
  return lines
    .map((line) => ({
      description: String(line.description || "").trim(),
      qty: Number(line.qty),
      unitCost: Number(line.unitCost),
    }))
    .filter((line) => line.description && line.qty > 0 && line.unitCost >= 0 && Number.isFinite(line.unitCost))
    .map((line) => ({
      ...line,
      qty: Math.round(line.qty * 1000) / 1000,
      unitCost: Math.round(line.unitCost * 100) / 100,
      amount: lineAmount(line.qty, line.unitCost),
    }));
}

export function invoiceTotal(lines: Array<{ amount: number }>): number {
  const total = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  return Math.round(total * 100) / 100;
}

export function summarizeInvoiceAmounts(
  invoices: Array<{ status: MerchantInvoiceStatus; total: number }>
): { paid: number; unpaid: number; count: number } {
  let paid = 0;
  let unpaid = 0;
  for (const invoice of invoices) {
    const total = Number(invoice.total || 0);
    if (invoice.status === "paid") paid += total;
    else unpaid += total;
  }
  return {
    paid: Math.round(paid * 100) / 100,
    unpaid: Math.round(unpaid * 100) / 100,
    count: invoices.length,
  };
}

export function merchantEmailTemplate(input: {
  template: MerchantEmailTemplate;
  invoiceNumber: string;
  vendorName: string;
  total: number;
  currency: string;
  dueDate: string;
  paymentTerm: MerchantPaymentTerm;
}): { subject: string; text: string } {
  const money = `${input.currency} ${input.total.toFixed(2)}`;
  const term = paymentTermLabel(input.paymentTerm);
  const dueDate = String(input.dueDate || "").slice(0, 10);
  if (input.template === "overdue") {
    return {
      subject: `Overdue invoice ${input.invoiceNumber} — payment required`,
      text: [
        `Dear ${input.vendorName},`,
        "",
        dueDate
          ? `Invoice ${input.invoiceNumber} for ${money} was due on ${dueDate} (${term}).`
          : `Invoice ${input.invoiceNumber} for ${money} has no due date (${term}) and is still unpaid.`,
        "Our records show this invoice is still unpaid. Please arrange payment immediately and reply with the payment reference.",
        "If payment has already been sent, send the proof of payment so we can close this item.",
        "",
        MERCHANT_COMPANY_NAME,
        "",
        MERCHANT_EMAIL_AUTOMATED_NOTE,
      ].join("\n"),
    };
  }
  return {
    subject: `Invoice ${input.invoiceNumber} from ${MERCHANT_COMPANY_NAME}`,
    text: [
      `Dear ${input.vendorName},`,
      "",
      `Thank you for the business. Please find invoice ${input.invoiceNumber} for ${money}.`,
      dueDate ? `Payment terms: ${term}. Due date: ${dueDate}.` : `Payment terms: ${term}. No due date is set.`,
      "The invoice is attached. Please reply if you need any detail changed.",
      "",
      "Kind regards,",
      MERCHANT_COMPANY_NAME,
      "",
      MERCHANT_EMAIL_AUTOMATED_NOTE,
    ].join("\n"),
  };
}

export type MerchantCashRow = {
  invoiceNumber: string;
  vendorName: string;
  issueDate: string;
  dueDate: string;
  status: string;
  total: number;
  currency: string;
  paymentMethod: string;
  chequeNumber: string;
  paidOn: string;
};

export function invoicesToCsv(rows: MerchantCashRow[]): string {
  const header = [
    "invoice_number",
    "vendor",
    "issue_date",
    "due_date",
    "status",
    "currency",
    "total",
    "payment_method",
    "cheque_number",
    "paid_on",
  ];
  const body = rows.map((row) =>
    [
      row.invoiceNumber,
      row.vendorName,
      row.issueDate,
      row.dueDate,
      row.status,
      row.currency,
      row.total.toFixed(2),
      row.paymentMethod,
      row.chequeNumber,
      row.paidOn,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
