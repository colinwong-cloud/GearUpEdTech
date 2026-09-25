export const MERCHANT_COMPANY_NAME = "GearUp EduTech Limited";
export const MERCHANT_PAYMENT_TERMS = ["cash_with_order", "net_30", "net_60"] as const;
export type MerchantPaymentTerm = (typeof MERCHANT_PAYMENT_TERMS)[number];
export type MerchantInvoiceStatus = "unpaid" | "paid";
export type MerchantEmailTemplate = "initial" | "overdue";

export type MerchantLineInput = {
  description: string;
  qty: number;
  unitCost: number;
};

export type MerchantMoneyLine = MerchantLineInput & {
  amount: number;
};

const TERM_DAYS: Record<MerchantPaymentTerm, number> = {
  cash_with_order: 0,
  net_30: 30,
  net_60: 60,
};

export function isMerchantPaymentTerm(value: string): value is MerchantPaymentTerm {
  return (MERCHANT_PAYMENT_TERMS as readonly string[]).includes(value);
}

export function paymentTermLabel(term: MerchantPaymentTerm): string {
  if (term === "cash_with_order") return "Cash with order";
  if (term === "net_30") return "Net 30";
  return "Net 60";
}

export function dueDateForTerm(issueDateIso: string, term: MerchantPaymentTerm): string {
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
  if (input.template === "overdue") {
    return {
      subject: `Overdue invoice ${input.invoiceNumber} — payment required`,
      text: [
        `Dear ${input.vendorName},`,
        "",
        `Invoice ${input.invoiceNumber} for ${money} was due on ${input.dueDate} (${term}).`,
        "Our records show this invoice is still unpaid. Please arrange payment immediately and reply with the payment reference.",
        "If payment has already been sent, send the proof of payment so we can close this item.",
        "",
        MERCHANT_COMPANY_NAME,
      ].join("\n"),
    };
  }
  return {
    subject: `Invoice ${input.invoiceNumber} from ${MERCHANT_COMPANY_NAME}`,
    text: [
      `Dear ${input.vendorName},`,
      "",
      `Thank you for the business. Please find invoice ${input.invoiceNumber} for ${money}.`,
      `Payment terms: ${term}. Due date: ${input.dueDate}.`,
      "The invoice is attached. Please reply if you need any detail changed.",
      "",
      "Kind regards,",
      MERCHANT_COMPANY_NAME,
    ].join("\n"),
  };
}

export function invoicesToCsv(
  rows: Array<{
    invoiceNumber: string;
    vendorName: string;
    issueDate: string;
    dueDate: string;
    status: string;
    total: number;
    currency: string;
  }>
): string {
  const header = ["invoice_number", "vendor", "issue_date", "due_date", "status", "currency", "total"];
  const body = rows.map((row) =>
    [
      row.invoiceNumber,
      row.vendorName,
      row.issueDate,
      row.dueDate,
      row.status,
      row.currency,
      row.total.toFixed(2),
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...body].join("\n");
}
