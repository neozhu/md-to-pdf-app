import { describe, expect, it } from "vitest";

import { buildPolishDisplayReviewerResult } from "./orchestration";

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
