import { describe, expect, it } from "vitest";
import { invoicePdf } from "./merchant-documents";
import type { MerchantInvoice } from "./merchant-store";

describe("merchant invoice pdf", () => {
  it("prints the company title, vendor PO number, and company stamp", () => {
    const invoice: MerchantInvoice = {
      id: "1",
      invoice_number: "GU-M-202609-0001",
      vendor_id: "v1",
      vendor_name: "North Partner",
      vendor_address: "1 Harbour Road",
      vendor_contact_name: "Ada",
      vendor_email: "ada@example.com",
      issue_date: "2026-09-25",
      due_date: "2026-10-25",
      payment_terms: "net_30",
      vendor_po_number: "PO-88421",
      notes: "Please pay to our account",
      status: "unpaid",
      paid_at: null,
      payment_method: null,
      cheque_number: "",
      paid_on: null,
      currency: "HKD",
      total: 19.8,
      items: [{ description: "Widgets", qty: 2, unit_cost: 9.9, amount: 19.8 }],
    };
    const pdf = invoicePdf(invoice).toString("latin1");
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("GearUp EduTech Limited");
    expect(pdf).toContain("P.O.#");
    expect(pdf).toContain("PO-88421");
    expect(pdf).toContain("25/09/2026");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain("HKD 19.80");
  });
});