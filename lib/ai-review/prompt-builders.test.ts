import { describe, expect, it } from "vitest";

import { buildEditorPrompt, buildReviewerPrompt } from "./prompt-builders";
import type { FactualBaseline, ReviewerResult, StructureSignals } from "./types";

const factualBaseline: FactualBaseline = {
  normalizedOriginal: "release v1.2.3 ships at https://example.com",
  originalTokenSet: new Set(["release", "v1.2.3", "https://example.com"]),
  originalNumbers: [],
  originalUrls: ["https://example.com"],
  originalVersions: ["v1.2.3"],
};

const reviewerResult: ReviewerResult = {
  review: "Original review summary.",
  keyImprovements: ["Original issue."],
  rewritePlan: ["Original plan step."],
};

const structureSignals: StructureSignals = {
  isLikelyUnstructuredPlainText: false,
  hasMarkdownSignals: true,
  hasParagraphBreak: true,
  nonEmptyLineCount: 2,
  avgLineLength: 24,
  headingLikeLineCount: 1,
  codeCueCount: 0,
  inlineListCueCount: 0,
  cues: [],
};

describe("AI review prompt builders", () => {
  it("relies on structured output instead of repeating a JSON contract", () => {
    const prompt = buildReviewerPrompt({
      markdown: "# Release\n\nShip it.",
      structureSignals,
    });

    expect(prompt).not.toContain("Output JSON only");
    expect(prompt).not.toContain("needsEdit");
  });

  it("uses the user-approved review as the sole editor brief", () => {
    const input = {
      markdown: "# Release\n\nShip v1.2.3 from https://example.com",
      reviewerResult,
      userApprovedReview:
        "Tighten the release note intro and keep the version/link unchanged.",
      factualBaseline,
    };
    const prompt = buildEditorPrompt(input);

    expect(prompt).toContain("<user_approved_review>");
    expect(prompt).toContain(
      "Tighten the release note intro and keep the version/link unchanged.",
    );
    expect(prompt).toContain(
      "Use this user-approved review as the editing brief.",
    );
    expect(prompt).not.toContain("<rewrite_plan>");
    expect(prompt).not.toContain("<context>");
  });
});
