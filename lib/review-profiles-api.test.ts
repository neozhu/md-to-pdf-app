import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createReviewProfile,
  deleteReviewProfile,
  listReviewProfiles,
  updateReviewProfile,
} from "./review-profiles-api";

const input = {
  name: "General",
  description: "Balanced review.",
  reviewerGuidance: "Review clarity.",
  editorGuidance: "Preserve intent.",
};

afterEach(() => vi.restoreAllMocks());

describe("review profile API client", () => {
  it("lists review profiles", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ profiles: [] }), { status: 200 }),
    );

    await expect(listReviewProfiles()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith("/api/review-profiles", {
      signal: undefined,
    });
  });

  it("creates a review profile", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ profile: { id: "id", ...input } }), {
        status: 201,
      }),
    );

    await createReviewProfile(input);

    expect(fetch).toHaveBeenCalledWith(
      "/api/review-profiles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ profile: input }),
      }),
    );
  });

  it("updates and deletes by id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: { id: "id", ...input } })),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await updateReviewProfile("id", input);
    await deleteReviewProfile("id");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/review-profiles/id",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/review-profiles/id", {
      method: "DELETE",
    });
  });

  it("uses the API error message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Review profile not found." }), {
        status: 404,
      }),
    );

    await expect(deleteReviewProfile("missing")).rejects.toThrow(
      "Review profile not found.",
    );
  });
});
