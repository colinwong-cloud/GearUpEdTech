import { MERCHANT_COMPANY_NAME, paymentTermLabel, type MerchantCashRow, type MerchantInvoiceStatus } from "@/lib/server/merchant-logic";
import { buildTextPdf } from "@/lib/server/merchant-pdf";
import type { MerchantInvoice } from "@/lib/server/merchant-store";

export function invoicePdf(invoice: MerchantInvoice): Buffer {
  const lines = [
    MERCHANT_COMPANY_NAME,
    `Invoice ${invoice.invoice_number}`,
    `Vendor: ${invoice.vendor_name}`,
    `Address: ${invoice.vendor_address}`,
    `Contact: ${invoice.vendor_contact_name} <${invoice.vendor_email}>`,
    `Issue date: ${invoice.issue_date}`,
    `Due date: ${invoice.due_date}`,
    `Payment terms: ${paymentTermLabel(invoice.payment_terms)}`,
    `Status: ${invoice.status}`,
    "",
    "Item | Qty | Unit cost | Amount",
    ...invoice.items.map(
      (item) =>
        `${item.description} | ${item.qty} | ${item.unit_cost.toFixed(2)} | ${item.amount.toFixed(2)}`
    ),
    "",
    `Total ${invoice.currency} ${invoice.total.toFixed(2)}`,
    "",
    "Notes",
    invoice.notes || "-",
  ];
  return buildTextPdf(`Invoice ${invoice.invoice_number}`, lines);
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
    "Issue date | Invoice | Status | Currency | Total | Payment method | Cheque number | Paid date",
    ...input.rows.map(
      (row) =>
        `${row.issueDate} | ${row.invoiceNumber} | ${row.status} | ${row.currency} | ${row.total.toFixed(2)} | ${row.paymentMethod || "-"} | ${row.chequeNumber || "-"} | ${row.paidOn || "-"}`
    ),
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

export function filterInvoicesForPeriod<T extends { vendor_id: string; issue_date: string; status: MerchantInvoiceStatus; total: number }>(
  invoices: T[],
  vendorId: string,
  from: string,
  to: string
): T[] {
  return invoices.filter(
    (invoice) =>
      invoice.vendor_id === vendorId &&
      invoice.issue_date >= from &&
      invoice.issue_date <= to
  );
}
