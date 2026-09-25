import { NextRequest, NextResponse } from "next/server";
import { monthlyStatementPdf } from "@/lib/server/merchant-documents";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { summarizeInvoiceAmounts } from "@/lib/server/merchant-logic";
import { listInvoices } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const month = req.nextUrl.searchParams.get("month") || "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "Month must be YYYY-MM" }, { status: 400 });
    }
    const invoices = (await listInvoices()).filter((invoice) => invoice.issue_date.startsWith(month));
    const byVendor = new Map<string, typeof invoices>();
    for (const invoice of invoices) {
      const bucket = byVendor.get(invoice.vendor_id) || [];
      bucket.push(invoice);
      byVendor.set(invoice.vendor_id, bucket);
    }
    const rows = [...byVendor.values()].map((bucket) => {
      const summary = summarizeInvoiceAmounts(bucket);
      return {
        vendor_id: bucket[0].vendor_id,
        vendor_name: bucket[0].vendor_name,
        invoice_count: summary.count,
        paid: summary.paid,
        unpaid: summary.unpaid,
      };
    });
    if (req.nextUrl.searchParams.get("format") === "pdf") {
      const pdf = monthlyStatementPdf({
        month,
        rows: rows.map((row) => ({
          vendorName: row.vendor_name,
          invoiceCount: row.invoice_count,
          paid: row.paid,
          unpaid: row.unpaid,
        })),
      });
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="statement-${month}.pdf"`,
        },
      });
    }
    return NextResponse.json({ month, rows });
  } catch (err) {
    return merchantError(err);
  }
}
