import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AI review API route profile handling", () => {
  const source = readFileSync("app/api/ai-review/route.ts", "utf8");

  it("parses and resolves the requested review profile", () => {
    expect(source).toContain("profile?: unknown");
    expect(source).toContain("resolveReviewProfileId(profile)");
  });

  it("passes the resolved profile into review and polish modes", () => {
    expect(source).toContain("reviewProfileId");
    expect(source).toContain("profile: reviewProfileId");
  });
});
