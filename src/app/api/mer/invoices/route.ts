import { NextRequest, NextResponse } from "next/server";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { createInvoice, listInvoices, markInvoicePaid, markInvoiceUnpaid } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ invoices: await listInvoices() });
  } catch (err) {
    return merchantError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as {
      vendor_id?: string;
      issue_date?: string;
      payment_terms?: string;
      vendor_po_number?: string;
      notes?: string;
      items?: Array<{ description?: string; qty?: number; unit_cost?: number }>;
    };
    const invoice = await createInvoice({
      vendorId: String(body.vendor_id || ""),
      issueDate: String(body.issue_date || ""),
      paymentTerms: String(body.payment_terms || ""),
      vendorPoNumber: String(body.vendor_po_number || ""),
      notes: String(body.notes || ""),
      items: (body.items || []).map((item) => ({
        description: String(item.description || ""),
        qty: Number(item.qty),
        unitCost: Number(item.unit_cost),
      })),
    });
    return NextResponse.json({ invoice });
  } catch (err) {
    return merchantError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as {
      id?: string;
      status?: string;
      payment_method?: string;
      cheque_number?: string;
      paid_on?: string;
    };
    if (!body.id || (body.status !== "paid" && body.status !== "unpaid")) {
      return NextResponse.json({ error: "Invalid invoice status" }, { status: 400 });
    }
    if (body.status === "unpaid") {
      await markInvoiceUnpaid(body.id);
    } else {
      await markInvoicePaid({
        id: body.id,
        method: String(body.payment_method || ""),
        chequeNumber: String(body.cheque_number || ""),
        paidOn: String(body.paid_on || ""),
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return merchantError(err);
  }
}
