import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI review progress dialog copy", () => {
  const source = readFileSync(
    "components/md/ai-review-progress-dialog.tsx",
    "utf8",
  );

  it("does not show the redundant review suggestions ready heading", () => {
    expect(source).not.toContain("Review suggestions ready");
  });

  it("does not show factual risk in the final decision card", () => {
    expect(source).not.toContain("Factual risk");
  });

  it("uses review-stage action labels that match the staged workflow", () => {
    expect(source).toContain("Skip Editing");
    expect(source).toContain("Apply Review");
    expect(source).not.toContain("AI Edit & Polish");
  });

  it("marks review pass done after editable review suggestions are ready", () => {
    expect(source).toContain(
      'active={activeAgent === "reviewer" && isAiReviewing && !dialogError}',
    );
    expect(source).toContain(
      'done={Boolean(editableReview) || (activeAgent === "editor" && !dialogError)}',
    );
  });

  it("requires a review profile before starting the review pass", () => {
    expect(source).toContain("Review Profile");
    expect(source).toContain("Start Review");
    expect(source).toContain("onReviewProfileChange");
    expect(source).toContain("onStartReview");
    expect(source).toContain("disabled={!selectedReviewProfile || isAiReviewing}");
  });

  it("shows the selected review profile after review starts", () => {
    expect(source).toContain("Selected profile");
    expect(source).toContain("selectedProfile?.label");
    expect(source).toContain("selectedProfile?.description");
  });
});
