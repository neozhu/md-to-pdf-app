// ---------------------------------------------------------------------------
// Core dual-agent AI review pipeline orchestration.
// This is the only module that depends on the AI SDK.
// ---------------------------------------------------------------------------

import { generateText, jsonSchema, NoOutputGeneratedError, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import type {
  AgentTokenUsage,
  AiReviewPayload,
  OpenAIStage,
  PrecomputedWorkflowContext,
  ReviewerResult,
  StageEvent,
} from "./types";
import type { ReviewProfile } from "../review-profiles";
import {
  buildEditorInstructions,
  buildReviewerInstructions,
} from "./review-profiles";
import {
  buildStructureSignals,
  parseRawBlocks,
  recoverCodeBlocks,
} from "./structure-analysis";
import {
  buildFactualBaseline,
  factualGuardWithBaseline,
  normalizeMarkdownForCompare,
} from "./factual-guard";
import {
  buildReviewerPrompt,
  buildEditorPrompt,
} from "./prompt-builders";

// ---------------------------------------------------------------------------
// Token-usage accounting helpers
// ---------------------------------------------------------------------------

export function emptyAgentTokenUsage(): AgentTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    calls: 0,
  };
}
export function normalizeAgentTokenUsage(usage: AgentTokenUsage): AgentTokenUsage {
  const normalizedTotal =
    usage.totalTokens > 0
      ? usage.totalTokens
      : Math.max(0, usage.inputTokens + usage.outputTokens);
  return {
    ...usage,
    totalTokens: normalizedTotal,
  };
}

function accumulateUsage(
  accumulator: AgentTokenUsage,
  result: {
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      inputTokenDetails?: {
        cacheReadTokens?: number;
      };
      outputTokenDetails?: {
        reasoningTokens?: number;
      };
    };
  },
) {
  accumulator.calls += 1;
  const usage = result.usage;
  if (!usage) return;
  if (typeof usage.inputTokens === "number") {
    accumulator.inputTokens += usage.inputTokens;
  }
  if (typeof usage.outputTokens === "number") {
    accumulator.outputTokens += usage.outputTokens;
  }
  if (typeof usage.totalTokens === "number") {
    accumulator.totalTokens += usage.totalTokens;
  }
  if (typeof usage.outputTokenDetails?.reasoningTokens === "number") {
    accumulator.reasoningTokens += usage.outputTokenDetails.reasoningTokens;
  }
  if (typeof usage.inputTokenDetails?.cacheReadTokens === "number") {
    accumulator.cachedInputTokens += usage.inputTokenDetails.cacheReadTokens;
  }
}

// ---------------------------------------------------------------------------
// Reviewer result helpers
// ---------------------------------------------------------------------------

function toReviewerResult(value: unknown): ReviewerResult | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<ReviewerResult>;
  if (
    typeof parsed.review !== "string" ||
    !Array.isArray(parsed.keyImprovements) ||
    !Array.isArray(parsed.rewritePlan)
  ) {
    return null;
  }
  return {
    review: parsed.review,
    keyImprovements: parsed.keyImprovements.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    ),
    rewritePlan: parsed.rewritePlan.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    ),
  };
}

function extractReviewerResult(
  reviewer: { output?: unknown; text?: string },
): ReviewerResult {
  // 1. Try SDK structured output — .output is a lazy getter that may throw
  //    NoOutputGeneratedError, so we access it safely.
  try {
    const parsed = toReviewerResult(reviewer.output);
    if (parsed) return parsed;
  } catch {
    // NoOutputGeneratedError or invalid shape — fall through to raw text
  }
  // 2. Fallback: manual JSON parse from raw text
  if (typeof reviewer.text === "string" && reviewer.text.length > 0) {
    const raw = tryParseJson(reviewer.text);
    const parsed = raw ? toReviewerResult(raw) : null;
    if (parsed) return parsed;
  }
  // 3. Conservative default
  return buildFallbackReviewerResult();
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function buildFallbackReviewerResult(): ReviewerResult {
  return {
    review:
      "No high-impact editorial issues detected.",
    keyImprovements: [
      "No high-impact clarity or structure issues were confirmed.",
      "Avoid unnecessary paraphrasing when meaning is already clear.",
      "Preserve the original wording unless an obvious error is present.",
    ],
    rewritePlan: [
      "Skip editing unless a clear, high-impact issue is identified.",
    ],
  };
}

function reviewerResultToEditableReview(result: ReviewerResult): string {
  const lines = [`Summary: ${result.review}`];
  if (result.keyImprovements.length > 0) {
    lines.push("", "Key improvements:");
    lines.push(...result.keyImprovements.map((item) => `- ${item}`));
  }
  if (result.rewritePlan.length > 0) {
    lines.push("", "Rewrite plan:");
    lines.push(...result.rewritePlan.map((item, index) => `${index + 1}. ${item}`));
  }
  return lines.join("\n");
}

export function buildPolishDisplayReviewerResult(editableReview: string): ReviewerResult {
  const changes = summarizeApprovedReviewChanges(editableReview);
  return {
    review:
      changes.length > 0
        ? "Applied changes from your approved review."
        : "AI polish completed using your approved review.",
    keyImprovements: changes,
    rewritePlan: [],
  };
}

function summarizeApprovedReviewChanges(editableReview: string): string[] {
  const ignoredPrefixes = new Set([
    "summary",
    "key improvements",
    "rewrite plan",
    "steps",
  ]);
  return editableReview
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "").trim())
    .filter((line) => line.length > 0)
    .filter((line) => {
      const normalized = line.replace(/:$/, "").toLowerCase();
      return !ignoredPrefixes.has(normalized);
    })
    .slice(0, 3);
}

function reviewerSchema() {
  return jsonSchema<ReviewerResult>({
    type: "object",
    properties: {
      review: { type: "string", minLength: 1 },
      keyImprovements: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 5,
      },
      rewritePlan: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 6,
      },
    },
    required: ["review", "keyImprovements", "rewritePlan"],
    additionalProperties: false,
  });
}

// ---------------------------------------------------------------------------
// Provider options per pipeline stage
// ---------------------------------------------------------------------------

function getOpenAIProviderOptions(stage: OpenAIStage) {
  const reasoningEffort = stage === "reviewer" ? "medium" : "low";
  return {
    openai: {
      reasoningEffort,
      textVerbosity: "low",
      ...(stage === "reviewer" ? { strictJsonSchema: true } : {}),
    },
  } as const;
}

const REVIEWER_MAX_TOKENS = 8192;
const EDITOR_MIN_TOKENS = 8192;
const EDITOR_MAX_TOKENS = 32768;
const EDITOR_REASONING_TOKENS = 4096;
const ESTIMATED_CHARS_PER_TOKEN = 3;

export function estimateMaxTokens(
  stage: OpenAIStage,
  inputLength: number,
): number {
  if (stage === "reviewer") return REVIEWER_MAX_TOKENS;

  const estimatedOutputTokens = Math.ceil(
    inputLength / ESTIMATED_CHARS_PER_TOKEN,
  );
  const budget = estimatedOutputTokens + EDITOR_REASONING_TOKENS;
  return Math.max(EDITOR_MIN_TOKENS, Math.min(EDITOR_MAX_TOKENS, budget));
}

// ---------------------------------------------------------------------------
// Workflow context resolution (all deterministic pre-computation)
// ---------------------------------------------------------------------------

export function resolveWorkflowContext(markdown: string): PrecomputedWorkflowContext {
  const structureSignals = buildStructureSignals(markdown);
  const rawBlocksResult = parseRawBlocks(markdown, 40);
  const codeRecoveryResult = recoverCodeBlocks(markdown, {
    includeRecoveredMarkdown: false,
    maxSuggestions: 12,
  });
  const factualBaseline = buildFactualBaseline(markdown);
  return {
    route: "REVIEW_THEN_POLISH",
    structureSignals,
    rawBlocksResult,
    codeRecoveryResult,
    factualBaseline,
  };
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runReviewPass(params: {
  markdown: string;
  model: string;
  openai: ReturnType<typeof createOpenAI>;
  profile: ReviewProfile;
  onStage?: (event: StageEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<AiReviewPayload> {
  const { markdown, model, openai, profile, onStage, abortSignal } = params;
  const throwIfAborted = () => {
    if (!abortSignal?.aborted) return;
    const reason = abortSignal.reason;
    throw reason instanceof Error ? reason : new Error("Request aborted.");
  };

  throwIfAborted();
  const workflow = resolveWorkflowContext(markdown);
  const reviewerUsage = emptyAgentTokenUsage();
  const editorUsage = emptyAgentTokenUsage();
  let reviewerResult = buildFallbackReviewerResult();

  onStage?.({
    agent: "reviewer",
    status: "started",
    message: "Reviewer Agent is analyzing clarity and flow...",
  });

  try {
    const reviewer = await generateText({
      model: openai(model),
      abortSignal,
      maxOutputTokens: estimateMaxTokens("reviewer", markdown.length),
      instructions: buildReviewerInstructions(profile),
      prompt: buildReviewerPrompt({
        markdown,
        structureSignals: workflow.structureSignals,
      }),
      output: Output.object({
        schema: reviewerSchema(),
        name: "reviewer_result",
      }),
      providerOptions: getOpenAIProviderOptions("reviewer"),
    });
    accumulateUsage(reviewerUsage, reviewer);
    throwIfAborted();
    reviewerResult = extractReviewerResult(reviewer);
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    const isNoOutput = NoOutputGeneratedError.isInstance(error);
    if (isNoOutput) {
      console.warn("[ai-review] Reviewer returned no structured output, using conservative fallback.");
    } else {
      console.error("[ai-review] Reviewer agent failed, using fallback:", error);
    }
  }

  onStage?.({
    agent: "reviewer",
    status: "completed",
    message: "Review pass complete. Review the suggestions before polishing.",
    usage: normalizeAgentTokenUsage(reviewerUsage),
  });

  return {
    review: reviewerResult.review,
    keyImprovements: reviewerResult.keyImprovements,
    rewritePlan: reviewerResult.rewritePlan,
    editableReview: reviewerResultToEditableReview(reviewerResult),
    polishedMarkdown: markdown,
    changed: false,
    tokenUsage: {
      reviewer: normalizeAgentTokenUsage(reviewerUsage),
      editor: normalizeAgentTokenUsage(editorUsage),
    },
    toolInsights: {
      workflowRoute: workflow.route,
      structureRecoveryDetected: false,
      editorSkipped: true,
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: 0,
      factualRiskLevel: "low",
      factualWarnings: [],
      factualRecommendation: "No changes were made during review.",
    },
  };
}

export async function runPolishPass(params: {
  markdown: string;
  userApprovedReview: string;
  model: string;
  openai: ReturnType<typeof createOpenAI>;
  profile: ReviewProfile;
  onStage?: (event: StageEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<AiReviewPayload> {
  const {
    markdown,
    userApprovedReview,
    model,
    openai,
    profile,
    onStage,
    abortSignal,
  } = params;
  const throwIfAborted = () => {
    if (!abortSignal?.aborted) return;
    const reason = abortSignal.reason;
    throw reason instanceof Error ? reason : new Error("Request aborted.");
  };

  const approvedReview = userApprovedReview.trim();
  if (!approvedReview) {
    throw new Error("Missing review instructions for polish pass.");
  }

  throwIfAborted();
  const workflow = resolveWorkflowContext(markdown);
  const reviewerUsage = emptyAgentTokenUsage();
  const editorUsage = emptyAgentTokenUsage();
  const displayReviewerResult = buildPolishDisplayReviewerResult(approvedReview);
  let polishedMarkdown = markdown;

  onStage?.({
    agent: "reviewer",
    status: "completed",
    message: "Using your approved review as the polish brief.",
    usage: normalizeAgentTokenUsage(reviewerUsage),
  });
  onStage?.({
    agent: "editor",
    status: "started",
    message: "Editor Agent is polishing with your approved review...",
  });

  try {
    const editorResult = await generateText({
      model: openai(model),
      abortSignal,
      maxOutputTokens: estimateMaxTokens("editor", markdown.length),
      instructions: buildEditorInstructions(profile),
      prompt: buildEditorPrompt({
        markdown,
        userApprovedReview: approvedReview,
        factualBaseline: workflow.factualBaseline,
      }),
      providerOptions: getOpenAIProviderOptions("editor"),
    });
    accumulateUsage(editorUsage, editorResult);
    throwIfAborted();
    polishedMarkdown = editorResult.text.trim() || markdown;
    onStage?.({
      agent: "editor",
      status: "completed",
      message: "Polish pass complete.",
      usage: normalizeAgentTokenUsage(editorUsage),
    });
  } catch (error) {
    if (abortSignal?.aborted) throw error;
    console.error("[ai-review] Editor agent failed, keeping original:", error);
    onStage?.({
      agent: "editor",
      status: "completed",
      message: `Editor agent encountered an error: ${error instanceof Error ? error.message : "unknown"}. Original text preserved.`,
      usage: normalizeAgentTokenUsage(editorUsage),
    });
  }

  const before = normalizeMarkdownForCompare(markdown);
  const changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  const factualRisk = changed
    ? factualGuardWithBaseline(workflow.factualBaseline, polishedMarkdown)
    : { riskLevel: "low" as const, warnings: [] as string[], recommendation: "No changes were made; factual fidelity is intact." };

  return {
    review: displayReviewerResult.review,
    keyImprovements: displayReviewerResult.keyImprovements,
    rewritePlan: displayReviewerResult.rewritePlan,
    editableReview: approvedReview,
    polishedMarkdown,
    changed,
    tokenUsage: {
      reviewer: normalizeAgentTokenUsage(reviewerUsage),
      editor: normalizeAgentTokenUsage(editorUsage),
    },
    toolInsights: {
      workflowRoute: workflow.route,
      structureRecoveryDetected: false,
      editorSkipped: false,
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: 0,
      factualRiskLevel: factualRisk.riskLevel,
      factualWarnings: factualRisk.warnings,
      factualRecommendation: factualRisk.recommendation,
    },
  };
}
