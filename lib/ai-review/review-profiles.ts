import { EDITOR_SYSTEM_PROMPT, REVIEWER_SYSTEM_PROMPT } from "./prompts";
import {
  resolveReviewProfileId,
  type ReviewProfileId,
} from "./review-profile-options";

const REVIEW_PROFILE_GUIDANCE: Record<
  ReviewProfileId,
  {
    reviewer: string;
    editor: string;
  }
> = {
  general: {
    reviewer:
      "Review as a general professional document. Prioritize clear structure, unambiguous wording, and consistent tone without imposing a specialized style.",
    editor:
      "Apply only targeted edits that improve clarity, structure, or tone while preserving the author's intent.",
  },
  "technical-doc": {
    reviewer:
      "Review as technical documentation. Prioritize technical documentation clarity, prerequisite gaps, step ordering, terminology consistency, command/code readability, and warnings where a reader could implement the wrong thing.",
    editor:
      "Preserve technical accuracy. Do not change commands, identifiers, APIs, paths, flags, versions, code blocks, or configuration values unless the approved review explicitly instructs a correction.",
  },
  "academic-formal": {
    reviewer:
      "Review as academic or formal writing. Prioritize argument flow, paragraph transitions, claim support, formality, and vague wording. Avoid marketing-style rewrites.",
    editor:
      "Keep the tone formal and restrained. Improve logical transitions and precision without making the prose promotional or changing claims.",
  },
};

export function buildReviewerInstructions(profileId: ReviewProfileId) {
  const resolvedProfileId = resolveReviewProfileId(profileId);
  return `${REVIEWER_SYSTEM_PROMPT}

<review_profile id="${resolvedProfileId}">
${REVIEW_PROFILE_GUIDANCE[resolvedProfileId].reviewer}
</review_profile>`;
}

export function buildEditorInstructions(profileId: ReviewProfileId) {
  const resolvedProfileId = resolveReviewProfileId(profileId);
  return `${EDITOR_SYSTEM_PROMPT}

<review_profile id="${resolvedProfileId}">
${REVIEW_PROFILE_GUIDANCE[resolvedProfileId].editor}
</review_profile>`;
}
