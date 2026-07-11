import type { ReviewProfile, ReviewProfileInput } from "./review-profiles";

async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? `Review profile request failed (${response.status}).`;
}

export async function listReviewProfiles(signal?: AbortSignal) {
  const response = await fetch("/api/review-profiles", { signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profiles: ReviewProfile[] }).profiles;
}

export async function createReviewProfile(profile: ReviewProfileInput) {
  const response = await fetch("/api/review-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profile: ReviewProfile }).profile;
}

export async function updateReviewProfile(
  id: string,
  profile: ReviewProfileInput,
) {
  const response = await fetch(`/api/review-profiles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profile: ReviewProfile }).profile;
}

export async function deleteReviewProfile(id: string) {
  const response = await fetch(`/api/review-profiles/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}
