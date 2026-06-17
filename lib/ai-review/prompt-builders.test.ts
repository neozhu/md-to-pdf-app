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
  it("does not include needsEdit in the reviewer output contract", () => {
    const prompt = buildReviewerPrompt({
      markdown: "# Release\n\nShip it.",
      structureSignals,
    });

    expect(prompt).toContain(
      "Output JSON only: { review, keyImprovements, rewritePlan }.",
    );
    expect(prompt).not.toContain("needsEdit");
  });

  it("injects the user-approved review as the editor instruction source", () => {
    const prompt = buildEditorPrompt({
      markdown: "# Release\n\nShip v1.2.3 from https://example.com",
      reviewerResult,
      userApprovedReview:
        "Tighten the release note intro and keep the version/link unchanged.",
      factualBaseline,
    });

    expect(prompt).toContain("<user_approved_review>");
    expect(prompt).toContain(
      "Tighten the release note intro and keep the version/link unchanged.",
    );
    expect(prompt).toContain(
      "Use this user-approved review as the editing brief.",
    );
  });
});
