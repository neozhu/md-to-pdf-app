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

  it("opens add and edit in a larger second dialog", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("z-[80]");
    expect(source).toContain("max-w-2xl");
    expect(source).toContain("max-h-[calc(100vh-2rem)]");
    expect(source).toContain("Add Review Profile");
    expect(source).toContain("Edit Review Profile");
    expect(source).toContain("min-h-40");
  });

  it("closes the form without closing the profile manager", () => {
    expect(source).toContain("function closeForm()");
    expect(source).toContain("onClick={closeForm}");
    expect(source).not.toContain("{!isEditing ? (");
  });
});
