import { describe, expect, it } from "vitest";

import type { ReviewProfile } from "../review-profiles";
import {
  buildEditorInstructions,
  buildReviewerInstructions,
} from "./review-profiles";

const profile: ReviewProfile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Technical Documentation",
  description: "Technical review.",
  reviewerGuidance: "Check prerequisites and step order.",
  editorGuidance: "Preserve commands and identifiers.",
};

describe("AI review profiles", () => {
  it("places reviewer guidance before final core constraints", () => {
    const instructions = buildReviewerInstructions(profile);

    expect(instructions).toContain(`<review_profile id="${profile.id}">`);
    expect(instructions).toContain(profile.reviewerGuidance);
    expect(instructions.indexOf(profile.reviewerGuidance)).toBeLessThan(
      instructions.indexOf("<trust_boundary>"),
    );
  });

  it("uses editor guidance without reviewer guidance", () => {
    const instructions = buildEditorInstructions(profile);

    expect(instructions).toContain(profile.editorGuidance);
    expect(instructions).not.toContain(profile.reviewerGuidance);
    expect(instructions.indexOf(profile.editorGuidance)).toBeLessThan(
      instructions.indexOf("<trust_boundary>"),
    );
  });

  it("states that profile guidance cannot replace the core policy", () => {
    expect(buildReviewerInstructions(profile)).toContain(
      "The review profile supplements the core policy.",
    );
    expect(buildEditorInstructions(profile)).toContain(
      "The review profile supplements the core policy.",
    );
  });
});
