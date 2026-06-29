import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Markdown dashboard AI review profile flow", () => {
  const source = readFileSync("components/md/md-dashboard.tsx", "utf8");

  it("opens the AI review dialog before starting the review request", () => {
    expect(source).toContain("function onOpenAiReviewDialog()");
    expect(source).toContain("onAiReview={onOpenAiReviewDialog}");
  });

  it("sends the selected review profile with the review request", () => {
    expect(source).toContain("selectedReviewProfile");
    expect(source).toContain("profile: selectedReviewProfile");
  });
});
