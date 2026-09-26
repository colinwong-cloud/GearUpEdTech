import { MERCHANT_COMPANY_NAME, cashflowInvoiceSummary, formatHkDate, paymentTermLabel, type MerchantCashRow, type MerchantInvoiceStatus } from "@/lib/server/merchant-logic";
import { buildLayoutPdf, buildTextPdf, companyStampImage, type PdfText } from "@/lib/server/merchant-pdf";
import type { MerchantInvoice } from "@/lib/server/merchant-store";

const NAVY: [number, number, number] = [0.12, 0.24, 0.4];
const TEAL: [number, number, number] = [0.22, 0.45, 0.62];
const INK: [number, number, number] = [0.15, 0.18, 0.22];

function hkMoney(amount: number): string {
  return amount.toFixed(2);
}

export function invoicePdf(invoice: MerchantInvoice): Buffer {
  const drawings = [
    "0.65 0.84 0.55 rg",
    "0 842 m 36 842 l 22 690 48 560 18 420 c 6 300 40 180 16 40 c 0 0 l h f",
    "0.98 0.86 0.45 rg",
    "0 760 m 22 760 l 10 620 28 500 8 360 c 0 240 l h f",
    "0.55 0.78 0.86 rg",
    "0 640 m 14 640 l 6 520 20 430 4 300 c 0 220 l h f",
    "0.75 0.82 0.78 RG 0.6 w",
    "56 612 m 540 612 l S",
    "56 588 m 540 588 l S",
  ];
  const texts: PdfText[] = [
    { text: MERCHANT_COMPANY_NAME, x: 56, y: 790, size: 18, bold: true, color: NAVY },
    { text: "INVOICE", x: 56, y: 762, size: 14, bold: true, color: TEAL },
    { text: "BILL TO", x: 56, y: 724, size: 10, bold: true, color: TEAL },
    { text: invoice.vendor_name, x: 56, y: 706, size: 11, bold: true, color: INK },
    { text: invoice.vendor_address || "-", x: 56, y: 690, size: 10, color: INK },
    { text: invoice.vendor_contact_name || "-", x: 56, y: 676, size: 10, color: INK },
    { text: invoice.vendor_email || "-", x: 56, y: 662, size: 10, color: INK },
    { text: "INVOICE #", x: 360, y: 724, size: 10, bold: true, color: TEAL },
    { text: invoice.invoice_number, x: 540, y: 724, size: 10, color: INK, align: "right" },
    { text: "INVOICE DATE", x: 360, y: 706, size: 10, bold: true, color: TEAL },
    { text: formatHkDate(invoice.issue_date), x: 540, y: 706, size: 10, color: INK, align: "right" },
    { text: "P.O.#", x: 360, y: 688, size: 10, bold: true, color: TEAL },
    { text: invoice.vendor_po_number || "-", x: 540, y: 688, size: 10, color: INK, align: "right" },
    { text: "DUE DATE", x: 360, y: 670, size: 10, bold: true, color: TEAL },
    { text: invoice.due_date ? formatHkDate(invoice.due_date) : "-", x: 540, y: 670, size: 10, color: INK, align: "right" },
    { text: "QTY", x: 56, y: 596, size: 10, bold: true, color: TEAL },
    { text: "DESCRIPTION", x: 110, y: 596, size: 10, bold: true, color: TEAL },
    { text: "UNIT PRICE", x: 400, y: 596, size: 10, bold: true, color: TEAL },
    { text: "AMOUNT", x: 540, y: 596, size: 10, bold: true, color: TEAL, align: "right" },
  ];
  invoice.items.slice(0, 12).forEach((item, index) => {
    const y = 570 - index * 18;
    texts.push(
      { text: String(item.qty), x: 56, y, size: 10, color: INK },
      { text: item.description, x: 110, y, size: 10, color: INK },
      { text: hkMoney(item.unit_cost), x: 400, y, size: 10, color: INK },
      { text: hkMoney(item.amount), x: 540, y, size: 10, color: INK, align: "right" }
    );
    drawings.push("0.82 0.88 0.9 RG 0.4 w", `56 ${y - 6} m 540 ${y - 6} l S`);
  });
  const totalY = 570 - Math.min(invoice.items.length, 12) * 18 - 16;
  texts.push(
    { text: "Subtotal", x: 400, y: totalY, size: 10, color: INK },
    { text: hkMoney(invoice.total), x: 540, y: totalY, size: 10, color: INK, align: "right" },
    { text: "TOTAL", x: 400, y: totalY - 22, size: 12, bold: true, color: NAVY },
    { text: `${invoice.currency} ${hkMoney(invoice.total)}`, x: 540, y: totalY - 22, size: 12, bold: true, color: NAVY, align: "right" },
    { text: "TERMS & CONDITIONS", x: 56, y: 150, size: 10, bold: true, color: TEAL },
    { text: `Payment terms: ${paymentTermLabel(invoice.payment_terms)}.`, x: 56, y: 132, size: 10, color: INK },
    { text: invoice.notes || "Please arrange payment by the due date.", x: 56, y: 116, size: 10, color: INK }
  );
  return buildLayoutPdf({ texts, drawings, image: companyStampImage() });
}

export function cashflowPdf(input: {
  vendorName: string;
  from: string;
  to: string;
  paid: number;
  unpaid: number;
  rows: MerchantCashRow[];
}): Buffer {
  const lines = [
    `${MERCHANT_COMPANY_NAME} cash flow`,
    `Vendor: ${input.vendorName}`,
    `Period: ${input.from} to ${input.to}`,
    `Paid: HKD ${input.paid.toFixed(2)}`,
    `Unpaid: HKD ${input.unpaid.toFixed(2)}`,
    "",
    ...input.rows.map((row) => cashflowInvoiceSummary(row)),
  ];
  return buildTextPdf("Cash flow statement", lines);
}

export function monthlyStatementPdf(input: {
  month: string;
  rows: Array<{
    vendorName: string;
    invoiceCount: number;
    paid: number;
    unpaid: number;
  }>;
}): Buffer {
  const lines = [
    MERCHANT_COMPANY_NAME,
    `Monthly invoice statement ${input.month}`,
    "Prepared for internal audit. Amounts are HKD.",
    "",
    "Vendor | Invoices | Paid | Outstanding",
    ...input.rows.map(
      (row) =>
        `${row.vendorName} | ${row.invoiceCount} | ${row.paid.toFixed(2)} | ${row.unpaid.toFixed(2)}`
    ),
  ];
  return buildTextPdf(`Statement ${input.month}`, lines);
}

export function filterInvoicesForPeriod<
  T extends {
    vendor_id: string;
    issue_date: string;
    status: MerchantInvoiceStatus;
    total: number;
    paid_on?: string | null;
  },
>(invoices: T[], vendorId: string, from: string, to: string): T[] {
  return invoices.filter((invoice) => {
    if (invoice.vendor_id !== vendorId) return false;
    const issued = invoice.issue_date >= from && invoice.issue_date <= to;
    const paidOn = String(invoice.paid_on || "").slice(0, 10);
    const paidInPeriod = invoice.status === "paid" && paidOn >= from && paidOn <= to;
    return issued || paidInPeriod;
  });
}
