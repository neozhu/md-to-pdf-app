export const REVIEW_PROFILE_OPTIONS = [
  {
    id: "general",
    label: "General",
    description: "Balanced review for clarity, structure, and tone.",
  },
  {
    id: "technical-doc",
    label: "Technical Doc",
    description: "Focus on technical accuracy, steps, terminology, and code blocks.",
  },
  {
    id: "academic-formal",
    label: "Academic / Formal",
    description: "Focus on logic, formality, transitions, and restrained wording.",
  },
] as const;

export type ReviewProfileId = (typeof REVIEW_PROFILE_OPTIONS)[number]["id"];

export function resolveReviewProfileId(value: unknown): ReviewProfileId {
  if (
    typeof value === "string" &&
    REVIEW_PROFILE_OPTIONS.some((profile) => profile.id === value)
  ) {
    return value as ReviewProfileId;
  }
  return "general";
}
