import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("review profile manager", () => {
  const source = readFileSync(
    "components/md/review-profile-manager.tsx",
    "utf8",
  );

  it("explains how to write reviewer and editor guidance", () => {
    expect(source).toContain("Tell the Reviewer which problems to inspect");
    expect(source).toContain("Tell the Editor how to apply an approved review");
  });

  it("supports add, edit, and delete actions", () => {
    expect(source).toContain("Add Profile");
    expect(source).toContain("Edit");
    expect(source).toContain("Delete");
    expect(source).toContain("window.confirm");
  });

  it("uses labels and field length limits", () => {
    expect(source).toContain("htmlFor={id}");
    expect(source).toContain('id="profile-name"');
    expect(source).toContain("REVIEW_PROFILE_LIMITS.name");
    expect(source).toContain("REVIEW_PROFILE_LIMITS.reviewerGuidance");
  });
});
