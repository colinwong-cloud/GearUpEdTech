export interface RawBalanceTransactionRow {
  id: string;
  student_name: string;
  change_amount: number;
  balance_after: number | null;
  created_at: string;
}

export interface GroupedBalanceTransactionRow {
  id: string;
  date: string;
  student_name: string;
  description: string;
  change_amount: number;
  balance_after: number | null;
}

export function groupBalanceTransactions(
  rows: RawBalanceTransactionRow[]
): GroupedBalanceTransactionRow[] {
  if (!rows.length) return [];

  const grouped = new Map<string, GroupedBalanceTransactionRow>();
  for (const tx of rows) {
    const createdAt = new Date(tx.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;

    const dateKey = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;
    const studentName = tx.student_name || "—";
    const key = `${dateKey}|${studentName}`;
    const existing = grouped.get(key);
    const currentBalanceAfter =
      typeof tx.balance_after === "number" ? tx.balance_after : null;

    if (!existing) {
      grouped.set(key, {
        id: key,
        date: dateKey,
        student_name: studentName,
        description: "當日合計扣除",
        change_amount: tx.change_amount,
        balance_after: currentBalanceAfter,
      });
      continue;
    }

    existing.change_amount += tx.change_amount;
    if (
      currentBalanceAfter !== null &&
      (existing.balance_after == null || currentBalanceAfter < existing.balance_after)
    ) {
      existing.balance_after = currentBalanceAfter;
    }
  }

  return [...grouped.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
