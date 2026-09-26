import { describe, expect, it } from "vitest";
import { merchantPasswordHash, verifyMerchantPassword } from "./merchant-auth";
import {
  cashflowInvoiceSummary,
  sortInvoicesByIssueDate,
  dueDateForTerm,
  formatHkDate,
  invoiceMatchesPaySearch,
  invoicesToCsv,
  merchantEmailTemplate,
  normalizeChequeNumber,
  normalizeLines,
  summarizeInvoiceAmounts,
} from "./merchant-logic";

describe("merchant invoice math", () => {
  it("sets due dates from payment terms and totals the lines", () => {
    expect(formatHkDate("2026-09-25")).toBe("25/09/2026");
    expect(dueDateForTerm("2026-09-25", "cash_with_order")).toBe("2026-09-25");
    expect(dueDateForTerm("2026-09-25", "net_30")).toBe("2026-10-25");
    expect(dueDateForTerm("2026-09-25", "net_60")).toBe("2026-11-24");
    expect(dueDateForTerm("2026-09-25", "net_90")).toBe("2026-12-24");
    expect(dueDateForTerm("2026-09-25", "blank")).toBeNull();
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
    expect(initial.subject).toContain("GearUp EduTech Limited");
    expect(initial.text).toContain("Thank you for the business");
    expect(overdue.subject).toContain("Overdue invoice");
    expect(overdue.text).toContain("still unpaid");
    expect(overdue.text).not.toContain("Thank you for the business");
    const open = merchantEmailTemplate({ ...base, template: "initial", paymentTerm: "blank", dueDate: "" });
    expect(open.text).toContain("Leave blank");
    expect(open.text).toContain("No due date is set");
    expect(open.text).not.toContain("Due date:");
    expect(initial.text).toContain("cs@gearupquiz.com");
    expect(overdue.text).toContain("Please do not reply directly to this message");
    expect(initial.text.trimEnd().endsWith("Thank you!")).toBe(true);
    expect(overdue.text.trimEnd().endsWith("Thank you!")).toBe(true);
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
        status: "paid",
        total: 19.8,
        currency: "HKD",
        paymentMethod: "Cheque",
        chequeNumber: "CHQ-19",
        paidOn: "2026-09-25",
      },
    ]);
    expect(csv).toContain('"Alpha ""HK"""');
    expect(csv).toContain("19.80");
    expect(csv).toContain("payment_method,cheque_number,paid_on");
    expect(csv).toContain("Cheque");
    expect(csv).toContain("CHQ-19");
    expect(csv).toContain("2026-09-25");
  });
});

describe("merchant cashflow issue date order", () => {
  it("sorts invoices by issue date, then invoice number", () => {
    const sorted = sortInvoicesByIssueDate([
      { issue_date: "2026-09-30", invoice_number: "GU-M-202609-0004" },
      { issue_date: "2026-09-01", invoice_number: "GU-M-202609-0002" },
      { issue_date: "2026-09-01", invoice_number: "GU-M-202609-0001" },
      { issue_date: "2026-09-22", invoice_number: "GU-M-202609-0006" },
    ]);
    expect(sorted.map((row) => row.invoice_number)).toEqual([
      "GU-M-202609-0001",
      "GU-M-202609-0002",
      "GU-M-202609-0006",
      "GU-M-202609-0004",
    ]);
  });
});

describe("merchant cashflow summary lines", () => {
  const base = {
    invoiceNumber: "GU-M-202609-0006",
    vendorName: "GU Testing Unit",
    issueDate: "2026-09-01",
    dueDate: "2026-10-31",
    currency: "HKD",
    total: 154,
    paymentMethod: "",
    chequeNumber: "",
    paidOn: "",
  };

  it("lists an unpaid invoice without payment method or paid date", () => {
    const line = cashflowInvoiceSummary({ ...base, status: "unpaid" });
    expect(line).toBe("2026-09-01 · GU-M-202609-0006 · Unpaid · HKD 154.00");
    expect(line).not.toContain("Cheque");
    expect(line).not.toContain("Paid");
  });

  it("adds cheque number and paid date only when the invoice is paid", () => {
    const line = cashflowInvoiceSummary({
      ...base,
      status: "paid",
      paymentMethod: "Cheque",
      chequeNumber: "88421",
      paidOn: "2026-09-26",
    });
    expect(line).toContain("Paid · HKD 154.00 · Cheque 88421 · paid 2026-09-26");
  });
});

describe("merchant cash payment search", () => {
  it("matches a vendor or invoice number substring and ignores a blank query", () => {
    expect(invoiceMatchesPaySearch("GU-M-202609-0001", "North Partner", "0001")).toBe(true);
    expect(invoiceMatchesPaySearch("GU-M-202609-0001", "North Partner", "north")).toBe(true);
    expect(invoiceMatchesPaySearch("GU-M-202609-0001", "North Partner", "south")).toBe(false);
    expect(invoiceMatchesPaySearch("GU-M-202609-0001", "North Partner", "  ")).toBe(false);
  });

  it("requires a cheque number only for cheque payments", () => {
    expect(normalizeChequeNumber("cash", "")).toBe("");
    expect(normalizeChequeNumber("bank_transfer", "ignored")).toBe("");
    expect(normalizeChequeNumber("cheque", " 88421 ")).toBe("88421");
    expect(() => normalizeChequeNumber("cheque", " ")).toThrow(/Cheque number is required/);
  });
});
