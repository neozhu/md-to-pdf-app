export const REVIEW_PROFILE_SELECT =
  "id, name, description, reviewer_guidance, editor_guidance";

export const REVIEW_PROFILE_LIMITS = {
  name: 80,
  description: 300,
  reviewerGuidance: 4_000,
  editorGuidance: 4_000,
} as const;

export type ReviewProfile = {
  id: string;
  name: string;
  description: string;
  reviewerGuidance: string;
  editorGuidance: string;
};

export type ReviewProfileInput = Omit<ReviewProfile, "id">;

type ReviewProfileRow = {
  id: string;
  name: string;
  description: string;
  reviewer_guidance: string;
  editor_guidance: string;
};

export function toReviewProfile(row: ReviewProfileRow): ReviewProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    reviewerGuidance: row.reviewer_guidance,
    editorGuidance: row.editor_guidance,
  };
}

export function validateReviewProfileInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return { ok: false as const, status: 400, error: "Missing profile." };
  }

  const value = input as Partial<Record<keyof ReviewProfileInput, unknown>>;
  const fields = Object.keys(REVIEW_PROFILE_LIMITS) as Array<
    keyof ReviewProfileInput
  >;
  const profile = {} as ReviewProfileInput;

  for (const field of fields) {
    const fieldValue = value[field];
    if (typeof fieldValue !== "string" || !fieldValue.trim()) {
      return { ok: false as const, status: 400, error: `Invalid ${field}.` };
    }
    const normalized = fieldValue.trim();
    if (normalized.length > REVIEW_PROFILE_LIMITS[field]) {
      return {
        ok: false as const,
        status: 400,
        error: `${field} is too long.`,
      };
    }
    profile[field] = normalized;
  }

  return { ok: true as const, profile };
}
