import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { invoicePdf } from "@/lib/server/merchant-documents";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { merchantEmailTemplate, type MerchantEmailTemplate } from "@/lib/server/merchant-logic";
import { getInvoice } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const { id } = await context.params;
    const body = (await req.json()) as { template?: MerchantEmailTemplate };
    if (body.template !== "initial" && body.template !== "overdue") {
      return NextResponse.json({ error: "Select an email template" }, { status: 400 });
    }
    const invoice = await getInvoice(id);
    if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    if (!invoice.vendor_email) {
      return NextResponse.json({ error: "Vendor email is missing" }, { status: 400 });
    }
    const apiKey = process.env.RESEND_API_KEY?.trim() || "";
    if (!apiKey) return NextResponse.json({ error: "RESEND_API_KEY is not configured" }, { status: 503 });
    const message = merchantEmailTemplate({
      template: body.template,
      invoiceNumber: invoice.invoice_number,
      vendorName: invoice.vendor_name,
      total: invoice.total,
      currency: invoice.currency,
      dueDate: invoice.due_date,
      paymentTerm: invoice.payment_terms,
    });
    const pdf = invoicePdf(invoice);
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "GearUp Trading <noreply@updates.hkedutech.com>",
      to: invoice.vendor_email,
      subject: message.subject,
      text: message.text,
      html: `<pre style="font-family:sans-serif">${escapeHtml(message.text)}</pre>`,
      attachments: [
        {
          filename: `${invoice.invoice_number}.pdf`,
          content: pdf.toString("base64"),
        },
      ],
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, to: invoice.vendor_email, template: body.template });
  } catch (err) {
    return merchantError(err);
  }
}
