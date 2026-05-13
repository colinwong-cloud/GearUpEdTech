import { describe, expect, it } from "vitest";
import { groupBalanceTransactions } from "./balance-transactions";

describe("groupBalanceTransactions", () => {
  it("groups same-day same-student records and sums deductions", () => {
    const grouped = groupBalanceTransactions([
      {
        id: "a",
        student_name: "HeiHei",
        change_amount: -3,
        balance_after: 97,
        created_at: "2026-05-13T08:00:00.000Z",
      },
      {
        id: "b",
        student_name: "HeiHei",
        change_amount: -7,
        balance_after: 90,
        created_at: "2026-05-13T09:00:00.000Z",
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].change_amount).toBe(-10);
    expect(grouped[0].balance_after).toBe(90);
  });

  it("keeps balance_after as null when all source rows are null", () => {
    const grouped = groupBalanceTransactions([
      {
        id: "a",
        student_name: "HeiHei",
        change_amount: -5,
        balance_after: null,
        created_at: "2026-05-13T08:00:00.000Z",
      },
      {
        id: "b",
        student_name: "HeiHei",
        change_amount: -5,
        balance_after: null,
        created_at: "2026-05-13T09:00:00.000Z",
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].balance_after).toBeNull();
  });
});
