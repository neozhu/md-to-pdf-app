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
    expect(source).toContain("profileId: selectedReviewProfile");
  });

  it("loads review profiles from the API", () => {
    expect(source).toContain("listReviewProfiles");
    expect(source).toContain("setReviewProfiles");
    expect(source).not.toContain("REVIEW_PROFILE_OPTIONS");
  });

  it("wires CodeMirror history state and commands into the header", () => {
    expect(source).toContain("React.useRef<MdEditorHandle>(null)");
    expect(source).toContain("onHistoryStateChange={setEditorHistoryState}");
    expect(source).toContain("canUndo={editorHistoryState.canUndo}");
    expect(source).toContain("canRedo={editorHistoryState.canRedo}");
    expect(source).toContain("onUndo={onUndo}");
    expect(source).toContain("onRedo={onRedo}");
  });
});
