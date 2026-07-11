import { describe, expect, it } from "vitest";

import {
  toReviewProfile,
  validateReviewProfileInput,
} from "./review-profiles";

const validInput = {
  name: " Technical Documentation ",
  description: " Reviews implementation guides. ",
  reviewerGuidance: " Check prerequisites. ",
  editorGuidance: " Preserve commands. ",
};

describe("review profile model", () => {
  it("trims and accepts valid input", () => {
    expect(validateReviewProfileInput(validInput)).toEqual({
      ok: true,
      profile: {
        name: "Technical Documentation",
        description: "Reviews implementation guides.",
        reviewerGuidance: "Check prerequisites.",
        editorGuidance: "Preserve commands.",
      },
    });
  });

  it.each(["name", "description", "reviewerGuidance", "editorGuidance"])(
    "rejects an empty %s",
    (field) => {
      expect(
        validateReviewProfileInput({ ...validInput, [field]: "   " }),
      ).toMatchObject({ ok: false, status: 400 });
    },
  );

  it("rejects fields over their maximum length", () => {
    expect(
      validateReviewProfileInput({
        ...validInput,
        name: "x".repeat(81),
      }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("maps a Supabase row to the application model", () => {
    expect(
      toReviewProfile({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "General",
        description: "Balanced review.",
        reviewer_guidance: "Review clarity.",
        editor_guidance: "Preserve intent.",
      }),
    ).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "General",
      description: "Balanced review.",
      reviewerGuidance: "Review clarity.",
      editorGuidance: "Preserve intent.",
    });
  });
});
