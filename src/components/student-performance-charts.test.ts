import { describe, expect, it } from "vitest";
import {
  lastNChartSessions,
  mergeCurrentSessionIntoChartSessions,
  type ChartSession,
} from "./student-performance-charts";

const session = (id: string, pct: number, createdAt: string): ChartSession => ({
  id,
  created_at: createdAt,
  questions_attempted: 10,
  score: pct,
  correct_pct: pct,
});

describe("mergeCurrentSessionIntoChartSessions", () => {
  it("appends the current session when missing from history", () => {
    const merged = mergeCurrentSessionIntoChartSessions([], {
      sessionId: "cur",
      score: 8,
      total: 10,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.correct_pct).toBe(80);
  });

  it("updates an existing session row by id", () => {
    const merged = mergeCurrentSessionIntoChartSessions([session("cur", 50, "2026-10-01")], {
      sessionId: "cur",
      score: 9,
      total: 10,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]?.correct_pct).toBe(90);
  });
});

describe("lastNChartSessions", () => {
  it("returns the newest N sessions in chronological order", () => {
    const rows = [
      session("a", 10, "2026-10-01"),
      session("b", 20, "2026-10-02"),
      session("c", 30, "2026-10-03"),
    ];
    const lastTwo = lastNChartSessions(rows, 2);
    expect(lastTwo.map((s) => s.id)).toEqual(["b", "c"]);
  });
});
