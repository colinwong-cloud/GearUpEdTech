import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildQuestionProgressMarkers,
  clearPracticeSkippedForIndex,
  onPracticeNavigateAway,
} from "./student-practice-ux";

describe("student practice star progress (Soft #263)", () => {
  it("Colin 1–10: answered 1–5, skip 6, on 7 → yellow / grey / circled star / dots", () => {
    const choices: Record<number, string> = {
      0: "A",
      1: "B",
      2: "C",
      3: "D",
      4: "A",
    };
    let visited: Record<number, boolean> = { 0: true };
    let skipped: Record<number, boolean> = {};
    for (let i = 0; i < 5; i++) {
      const nav = onPracticeNavigateAway(i, i + 1, choices, visited, skipped);
      visited = nav.visited;
      skipped = nav.skipped;
    }
    const leaveQ6 = onPracticeNavigateAway(5, 6, choices, visited, skipped);
    visited = leaveQ6.visited;
    skipped = leaveQ6.skipped;

    const markers = buildQuestionProgressMarkers(
      10,
      6,
      visited,
      skipped,
      choices
    );
    expect(markers.slice(0, 5)).toEqual([
      "answered-star",
      "answered-star",
      "answered-star",
      "answered-star",
      "answered-star",
    ]);
    expect(markers[5]).toBe("skipped-grey-star");
    expect(markers[6]).toBe("current-unanswered-star");
    expect(markers.slice(7)).toEqual([
      "unvisited-dot",
      "unvisited-dot",
      "unvisited-dot",
    ]);
  });

  it("current question on Q4 (index 3) uses circled marker", () => {
    const markers = buildQuestionProgressMarkers(
      10,
      3,
      { 0: true, 1: true, 2: true, 3: true },
      {},
      { 0: "A", 1: "B", 2: "C" }
    );
    expect(markers[3]).toBe("current-unanswered-star");
  });

  it("answered current question shows yellow star in circle", () => {
    const markers = buildQuestionProgressMarkers(
      5,
      2,
      { 0: true, 1: true, 2: true },
      {},
      { 0: "A", 1: "B", 2: "C" }
    );
    expect(markers[2]).toBe("current-answered-star");
  });

  it("returning to skipped unanswered shows grey in circle", () => {
    const markers = buildQuestionProgressMarkers(
      5,
      1,
      { 0: true, 1: true },
      { 1: true },
      {}
    );
    expect(markers[1]).toBe("current-skipped-grey-star");
  });

  it("answering a previously skipped question turns marker yellow", () => {
    const choices: Record<number, string> = { 1: "D" };
    let skipped = { 1: true };
    skipped = clearPracticeSkippedForIndex(skipped, 1);
    const markers = buildQuestionProgressMarkers(
      5,
      1,
      { 0: true, 1: true },
      skipped,
      choices
    );
    expect(markers[1]).toBe("current-answered-star");
    const markersAway = buildQuestionProgressMarkers(
      5,
      0,
      { 0: true, 1: true },
      skipped,
      choices
    );
    expect(markersAway[1]).toBe("answered-star");
  });

  it("markers are not tap-to-jump controls (component is display-only)", () => {
    const quizSource = readFileSync(
      resolve(process.cwd(), "src/components/student-quiz-experience.tsx"),
      "utf8"
    );
    const starBlock = quizSource.slice(
      quizSource.indexOf("function StarProgress"),
      quizSource.indexOf("function OptionButton")
    );
    expect(starBlock).toContain('data-star-progress-interactive="false"');
    expect(starBlock).not.toContain("onClick");
    expect(starBlock).not.toContain("<button");
  });
});