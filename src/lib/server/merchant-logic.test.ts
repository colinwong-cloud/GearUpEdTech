import { describe, expect, it } from "vitest";
import { merchantPasswordHash, verifyMerchantPassword } from "./merchant-auth";
import {
  dueDateForTerm,
  invoicesToCsv,
  merchantEmailTemplate,
  normalizeLines,
  summarizeInvoiceAmounts,
} from "./merchant-logic";

describe("merchant invoice math", () => {
  it("sets due dates from payment terms and totals the lines", () => {
    expect(dueDateForTerm("2026-09-25", "cash_with_order")).toBe("2026-09-25");
    expect(dueDateForTerm("2026-09-25", "net_30")).toBe("2026-10-25");
    expect(dueDateForTerm("2026-09-25", "net_60")).toBe("2026-11-24");
    const lines = normalizeLines([
      { description: "Widgets", qty: 2, unitCost: 9.9 },
      { description: "", qty: 1, unitCost: 5 },
    ]);
    expect(lines).toEqual([{ description: "Widgets", qty: 2, unitCost: 9.9, amount: 19.8 }]);
  });

  it("splits paid and unpaid totals for one vendor period", () => {
    expect(
      summarizeInvoiceAmounts([
        { status: "paid", total: 10 },
        { status: "unpaid", total: 5.5 },
        { status: "paid", total: 1.25 },
      ])
    ).toEqual({ paid: 11.25, unpaid: 5.5, count: 3 });
  });
});

describe("merchant email templates", () => {
  const base = {
    invoiceNumber: "GU-M-202609-0001",
    vendorName: "North Partner",
    total: 100,
    currency: "HKD",
    dueDate: "2026-10-25",
    paymentTerm: "net_30" as const,
  };

  it("uses a polite first-send tone and a serious overdue tone", () => {
    const initial = merchantEmailTemplate({ ...base, template: "initial" });
    const overdue = merchantEmailTemplate({ ...base, template: "overdue" });
    expect(initial.subject).toContain("Invoice GU-M-202609-0001");
    expect(initial.text).toContain("Thank you for the business");
    expect(overdue.subject).toContain("Overdue invoice");
    expect(overdue.text).toContain("still unpaid");
    expect(overdue.text).not.toContain("Thank you for the business");
  });
});

describe("merchant login hash", () => {
  it("stores a scrypt hash and does not keep the password in source form", () => {
    const hash = merchantPasswordHash();
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash.includes("123456")).toBe(false);
    expect(verifyMerchantPassword("not-the-password", hash)).toBe(false);
  });
});

describe("merchant csv", () => {
  it("quotes vendor names", () => {
    const csv = invoicesToCsv([
      {
        invoiceNumber: "GU-M-202609-0001",
        vendorName: 'Alpha "HK"',
        issueDate: "2026-09-25",
        dueDate: "2026-10-25",
        status: "unpaid",
        total: 19.8,
        currency: "HKD",
      },
    ]);
    expect(csv).toContain('"Alpha ""HK"""');
    expect(csv).toContain("19.80");
  });
});
