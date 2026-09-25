import { NextRequest, NextResponse } from "next/server";
import { invoicePdf } from "@/lib/server/merchant-documents";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { getInvoice } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    const pdf = invoicePdf(invoice);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err) {
    return merchantError(err);
  }
}
