import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI review API route profile handling", () => {
  const source = readFileSync("app/api/ai-review/route.ts", "utf8");

  it("only supports the explicit review and polish stages", () => {
    expect(source).not.toContain("runDualAgentReview");
    expect(source).toContain('mode !== "review" && mode !== "polish"');
    expect(source).toContain("Unsupported AI review mode.");
  });

  it("requires authentication before running AI review", () => {
    expect(source).toContain("getAuthenticatedUserFromCookie");
    expect(source).toContain("status: 401");
  });

  it("loads the requested profile and returns 404 when missing", () => {
    expect(source).toContain("profileId?: unknown");
    expect(source).toContain('.from("review_profiles")');
    expect(source).toContain('.eq("id", profileId)');
    expect(source).toContain("status: 404");
    expect(source).not.toContain("resolveReviewProfileId");
  });

  it("passes the resolved profile into review and polish modes", () => {
    expect(source).toContain("reviewProfile");
    expect(source).toContain("profile: reviewProfile");
  });
});
