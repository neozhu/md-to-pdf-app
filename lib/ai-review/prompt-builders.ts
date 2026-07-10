// ---------------------------------------------------------------------------
// Functions that compose the user-facing prompts sent to each LLM agent.
// These import types only — no AI SDK dependency.
// ---------------------------------------------------------------------------

import type {
  FactualBaseline,
  StructureSignals,
} from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function listPreview(items: string[], maxItems: number) {
  const limited = items.slice(0, maxItems);
  return limited.length > 0 ? limited.join(", ") : "";
}

function buildFactualConstraints(baseline: FactualBaseline): string {
  const entries: string[] = [];
  const urls = listPreview(baseline.originalUrls, 40);
  const numbers = listPreview(baseline.originalNumbers, 60);
  const versions = listPreview(baseline.originalVersions, 40);
  if (urls) entries.push(`- URLs: ${urls}`);
  if (numbers) entries.push(`- Numbers: ${numbers}`);
  if (versions) entries.push(`- Versions: ${versions}`);
  if (entries.length === 0) return "";
  return [
    "<factual_constraints>",
    "DO NOT change the following values:",
    ...entries,
    "</factual_constraints>",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Prompt builders (exported)
// ---------------------------------------------------------------------------

export function buildReviewerPrompt(params: {
  markdown: string;
  structureSignals: StructureSignals;
}) {
  const { markdown, structureSignals } = params;
  const cues = structureSignals.cues.join(", ");
  return [
    ...(cues ? [`Structural cues: ${cues}`, ""] : []),
    "<markdown>",
    markdown,
    "</markdown>",
  ].join("\n");
}

export function buildEditorPrompt(params: {
  markdown: string;
  userApprovedReview: string;
  factualBaseline: FactualBaseline;
}) {
  const { markdown, userApprovedReview, factualBaseline } = params;
  const constraints = buildFactualConstraints(factualBaseline);
  const approvedReview = userApprovedReview.trim();
  return [
    "<user_approved_review>",
    "Use this user-approved review as the editing brief.",
    approvedReview,
    "</user_approved_review>",
    "",
    ...(constraints ? [constraints, ""] : []),
    "<markdown>",
    markdown,
    "</markdown>",
  ].join("\n");
}
