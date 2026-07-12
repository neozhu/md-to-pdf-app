import { describe, expect, it } from "vitest";

import {
  buildPolishDisplayReviewerResult,
  estimateMaxTokens,
} from "./orchestration";

describe("estimateMaxTokens", () => {
  it("reserves a fixed reasoning budget for the reviewer", () => {
    expect(estimateMaxTokens("reviewer", 0)).toBe(8192);
    expect(estimateMaxTokens("reviewer", 100_000)).toBe(8192);
  });

  it("uses the minimum editor budget for short input", () => {
    expect(estimateMaxTokens("editor", 0)).toBe(8192);
  });

  it("adds reasoning headroom to the estimated editor output", () => {
    expect(estimateMaxTokens("editor", 30_000)).toBe(14_096);
  });

  it("caps the editor budget for long input", () => {
    expect(estimateMaxTokens("editor", 100_000)).toBe(32_768);
  });
});

describe("AI review orchestration display helpers", () => {
  it("summarizes the approved review without echoing the full text", () => {
    const result = buildPolishDisplayReviewerResult(
      [
        "Summary: This is a long edited review.",
        "",
        "Key improvements:",
        "- Clarify the callback reference.",
        "- Fix the inaccurate comment.",
        "",
        "Rewrite plan:",
        "1. Tighten the intro.",
      ].join("\n"),
    );

    expect(result.review).toBe("Applied changes from your approved review.");
    expect(result.keyImprovements).toEqual([
      "Clarify the callback reference.",
      "Fix the inaccurate comment.",
      "Tighten the intro.",
    ]);
    expect(result.rewritePlan).toEqual([]);
  });
});
