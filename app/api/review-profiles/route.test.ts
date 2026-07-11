import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("review profile API routes", () => {
  const collection = readFileSync(
    "app/api/review-profiles/route.ts",
    "utf8",
  );
  const item = readFileSync(
    "app/api/review-profiles/[id]/route.ts",
    "utf8",
  );

  it("authenticates every operation", () => {
    expect(collection.match(/getAuthenticatedUserFromCookie/g)).toHaveLength(3);
    expect(item.match(/getAuthenticatedUserFromCookie/g)).toHaveLength(3);
    expect(collection).toContain("status: 401");
    expect(item).toContain("status: 401");
  });

  it("validates writes and never upserts updates", () => {
    expect(collection).toContain("validateReviewProfileInput");
    expect(item).toContain("validateReviewProfileInput");
    expect(item).toContain(".update(");
    expect(item).not.toContain(".upsert(");
  });

  it("returns not found when update or delete matches no row", () => {
    expect(item).toContain(".maybeSingle()");
    expect(item).toContain("status: 404");
  });
});
