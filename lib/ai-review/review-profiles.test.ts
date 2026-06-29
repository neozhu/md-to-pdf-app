import { describe, expect, it } from "vitest";

import {
  buildEditorInstructions,
  buildReviewerInstructions,
} from "./review-profiles";
import {
  resolveReviewProfileId,
  REVIEW_PROFILE_OPTIONS,
} from "./review-profile-options";
import { EDITOR_SYSTEM_PROMPT, REVIEWER_SYSTEM_PROMPT } from "./prompts";

describe("AI review profiles", () => {
  it("keeps review profile options in one editable configuration", () => {
    expect(REVIEW_PROFILE_OPTIONS.map((profile) => profile.id)).toEqual([
      "general",
      "technical-doc",
      "academic-formal",
    ]);
    expect(REVIEW_PROFILE_OPTIONS.every((profile) => profile.label)).toBe(true);
    expect(REVIEW_PROFILE_OPTIONS.every((profile) => profile.description)).toBe(true);
  });

  it("falls back to general for unknown profile ids", () => {
    expect(resolveReviewProfileId("technical-doc")).toBe("technical-doc");
    expect(resolveReviewProfileId("unknown-profile")).toBe("general");
    expect(resolveReviewProfileId(undefined)).toBe("general");
  });

  it("builds reviewer and editor instructions from base prompts plus profile guidance", () => {
    const reviewerInstructions = buildReviewerInstructions("technical-doc");
    const editorInstructions = buildEditorInstructions("technical-doc");

    expect(reviewerInstructions).toContain(REVIEWER_SYSTEM_PROMPT);
    expect(editorInstructions).toContain(EDITOR_SYSTEM_PROMPT);
    expect(reviewerInstructions).toContain("<review_profile id=\"technical-doc\">");
    expect(editorInstructions).toContain("<review_profile id=\"technical-doc\">");
    expect(reviewerInstructions).toContain("technical documentation");
    expect(editorInstructions).toContain("technical accuracy");
  });

  it("keeps public profile options separate from system prompt text", () => {
    const serializedOptions = JSON.stringify(REVIEW_PROFILE_OPTIONS);

    expect(serializedOptions).not.toContain(REVIEWER_SYSTEM_PROMPT);
    expect(serializedOptions).not.toContain(EDITOR_SYSTEM_PROMPT);
  });
});
