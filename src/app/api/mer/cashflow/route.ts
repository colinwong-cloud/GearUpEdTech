import { NextRequest, NextResponse } from "next/server";
import { cashflowPdf, filterInvoicesForPeriod } from "@/lib/server/merchant-documents";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { invoicesToCsv, settlementMethodLabel, sortInvoicesByIssueDate, summarizeInvoiceAmounts, type MerchantCashRow } from "@/lib/server/merchant-logic";
import { listInvoices } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const vendorId = req.nextUrl.searchParams.get("vendor_id") || "";
    const from = req.nextUrl.searchParams.get("from") || "";
    const to = req.nextUrl.searchParams.get("to") || "";
    const format = req.nextUrl.searchParams.get("format") || "json";
    if (!vendorId || !from || !to) {
      return NextResponse.json({ error: "Vendor and period are required" }, { status: 400 });
    }
    const invoices = await listInvoices();
    const rows = sortInvoicesByIssueDate(filterInvoicesForPeriod(invoices, vendorId, from, to));
    const summary = summarizeInvoiceAmounts(rows);
    const vendorName = rows[0]?.vendor_name || invoices.find((row) => row.vendor_id === vendorId)?.vendor_name || "";
    const cashRows: MerchantCashRow[] = rows.map((row) => ({
      invoiceNumber: row.invoice_number,
      vendorName: row.vendor_name,
      issueDate: row.issue_date,
      dueDate: row.due_date,
      status: row.status,
      total: row.total,
      currency: row.currency,
      paymentMethod: row.status === "paid" && row.payment_method ? settlementMethodLabel(row.payment_method) : "",
      chequeNumber: row.status === "paid" && row.payment_method === "cheque" ? row.cheque_number || "" : "",
      paidOn: row.status === "paid" ? row.paid_on || "" : "",
    }));
    if (format === "csv") {
      const csv = invoicesToCsv(cashRows);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=cashflow.csv",
        },
      });
    }
    if (format === "pdf") {
      const pdf = cashflowPdf({
        vendorName,
        from,
        to,
        paid: summary.paid,
        unpaid: summary.unpaid,
        rows: cashRows,
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": "attachment; filename=cashflow.pdf",
        },
      });
    }
    return NextResponse.json({ vendor_name: vendorName, from, to, ...summary, invoices: rows });
  } catch (err) {
    return merchantError(err);
  }
}
