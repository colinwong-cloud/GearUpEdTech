import { NextRequest, NextResponse } from "next/server";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { createInvoice, listInvoices, setInvoiceStatus } from "@/lib/server/merchant-store";
import type { MerchantInvoiceStatus } from "@/lib/server/merchant-logic";

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
      notes?: string;
      items?: Array<{ description?: string; qty?: number; unit_cost?: number }>;
    };
    const invoice = await createInvoice({
      vendorId: String(body.vendor_id || ""),
      issueDate: String(body.issue_date || ""),
      paymentTerms: String(body.payment_terms || ""),
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
    const body = (await req.json()) as { id?: string; status?: MerchantInvoiceStatus };
    if (!body.id || (body.status !== "paid" && body.status !== "unpaid")) {
      return NextResponse.json({ error: "Invalid invoice status" }, { status: 400 });
    }
    await setInvoiceStatus(body.id, body.status);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return merchantError(err);
  }
}
