// ---------------------------------------------------------------------------
// Functions that compose the user-facing prompts sent to each LLM agent.
// These import types only — no AI SDK dependency.
// ---------------------------------------------------------------------------

import type {
  CodeRecoveryResult,
  FactualBaseline,
  RawBlocksResult,
  ReviewerResult,
  StructureSignals,
} from "./types";

const RAW_BLOCK_PREVIEW_LIMIT = 12;
const CODE_SUGGESTION_PREVIEW_LIMIT = 8;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function listPreview(items: string[], maxItems: number) {
  const limited = items.slice(0, maxItems);
  return limited.length > 0 ? limited.join(", ") : "";
}

function summarizeRawBlockHints(rawBlocksResult: RawBlocksResult) {
  const lines = rawBlocksResult.blocks
    .slice(0, RAW_BLOCK_PREVIEW_LIMIT)
    .map(
      (block) =>
        `- [${block.kind}] L${block.startLine}-L${block.endLine} (confidence ${block.confidence.toFixed(2)}): ${block.preview}`,
    );
  return lines.length > 0 ? lines.join("\n") : "- none";
}

function summarizeCodeRecoveryHints(codeRecoveryResult: CodeRecoveryResult) {
  const lines = codeRecoveryResult.suggestions
    .slice(0, CODE_SUGGESTION_PREVIEW_LIMIT)
    .map(
      (suggestion) =>
        `- L${suggestion.startLine}-L${suggestion.endLine} \`${suggestion.language || "plain"}\` (confidence ${suggestion.confidence.toFixed(2)}): ${suggestion.preview}`,
    );
  return lines.length > 0 ? lines.join("\n") : "- none";
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

export function buildFormatterPrompt(params: {
  markdown: string;
  rawBlocksResult: RawBlocksResult;
  codeRecoveryResult: CodeRecoveryResult;
}) {
  const { markdown, rawBlocksResult, codeRecoveryResult } = params;
  return [
    "Input Context:",
    `- Raw block counts: total=${rawBlocksResult.blockCount}, headings=${rawBlocksResult.headingCandidateCount}, lists=${rawBlocksResult.listCandidateCount}, code=${rawBlocksResult.codeCandidateCount}`,
    `- Recovered code block candidates: ${codeRecoveryResult.recoveredBlockCount}`,
    "",
    "Raw Block Hints:",
    summarizeRawBlockHints(rawBlocksResult),
    "",
    "Code Recovery Hints:",
    summarizeCodeRecoveryHints(codeRecoveryResult),
    "",
    "Original Raw Text:",
    markdown,
  ].join("\n");
}

export function buildReviewerPrompt(params: {
  markdown: string;
  structureSignals: StructureSignals;
}) {
  const { markdown, structureSignals } = params;
  const cues = structureSignals.cues.join(", ");
  return [
    "Review the markdown below. Detect the content language and evaluate in that language.",
    "Output JSON only: { needsEdit, review, keyImprovements, rewritePlan }.",
    "",
    ...(cues ? [`Structural cues: ${cues}`, ""] : []),
    "<markdown>",
    markdown,
    "</markdown>",
  ].join("\n");
}

export function buildEditorPrompt(params: {
  markdown: string;
  reviewerResult: ReviewerResult;
  factualBaseline: FactualBaseline;
}) {
  const { markdown, reviewerResult, factualBaseline } = params;
  const constraints = buildFactualConstraints(factualBaseline);
  return [
    "<rewrite_plan>",
    `Summary: ${reviewerResult.review}`,
    "",
    "Steps (execute in order):",
    ...reviewerResult.rewritePlan.map((step, i) => `${i + 1}. ${step}`),
    "</rewrite_plan>",
    "",
    "<context>",
    "Problems identified (for reference only — do NOT use as editing instructions):",
    ...reviewerResult.keyImprovements.map((item, i) => `${i + 1}. ${item}`),
    "</context>",
    "",
    ...(constraints ? [constraints, ""] : []),
    "<markdown>",
    markdown,
    "</markdown>",
  ].join("\n");
}
