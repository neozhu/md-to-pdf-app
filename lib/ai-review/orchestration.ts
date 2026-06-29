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
  WorkflowRoute,
} from "./types";
import {
  FORMATTER_SYSTEM_PROMPT,
} from "./prompts";
import {
  buildEditorInstructions,
  buildReviewerInstructions,
} from "./review-profiles";
import type { ReviewProfileId } from "./review-profile-options";
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
  buildFormatterPrompt,
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

function buildPolishPromptReviewerResult(editableReview: string): ReviewerResult {
  const review = editableReview.trim();
  return {
    review: review || "No user-approved review was provided.",
    keyImprovements: review ? [review] : [],
    rewritePlan: review ? [review] : [],
  };
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
  const reasoningEffort =
    stage === "formatter"
      ? "minimal"
      : stage === "reviewer"
        ? "medium"
        : "low";
  return {
    openai: {
      reasoningEffort,
      textVerbosity: "low",
      ...(stage === "reviewer" ? { strictJsonSchema: true } : {}),
    },
  } as const;
}

function estimateMaxTokens(stage: OpenAIStage, inputLength: number): number {
  // Reasoning models (e.g. gpt-5-mini) count reasoning tokens against
  // maxOutputTokens, so the budget must include headroom for internal
  // chain-of-thought on top of the actual output tokens.
  if (stage === "reviewer") return 4096; // JSON ~300 tokens + reasoning ~2-3k
  // ~3 chars/token (conservative blend of English & CJK), 1.5x headroom for added markup
  const estimated = Math.ceil((inputLength / 3) * 1.5);
  return Math.max(2048, Math.min(16384, estimated));
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
  const isBroken = structureSignals.isLikelyUnstructuredPlainText;
  const route: WorkflowRoute =
    isBroken ||
    (structureSignals.codeCueCount > 2 && !structureSignals.hasMarkdownSignals)
      ? "BRANCH_A"
      : "BRANCH_B";
  return {
    route,
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
  profile: ReviewProfileId;
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
      structureRecoveryDetected: workflow.route === "BRANCH_A",
      editorSkipped: true,
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: workflow.codeRecoveryResult.recoveredBlockCount,
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
  profile: ReviewProfileId;
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
  const promptReviewerResult = buildPolishPromptReviewerResult(approvedReview);
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
        reviewerResult: promptReviewerResult,
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
      structureRecoveryDetected: workflow.route === "BRANCH_A",
      editorSkipped: false,
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: workflow.codeRecoveryResult.recoveredBlockCount,
      factualRiskLevel: factualRisk.riskLevel,
      factualWarnings: factualRisk.warnings,
      factualRecommendation: factualRisk.recommendation,
    },
  };
}

export async function runDualAgentReview(params: {
  markdown: string;
  model: string;
  openai: ReturnType<typeof createOpenAI>;
  profile: ReviewProfileId;
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
  let review = "";
  let keyImprovements: string[] = [];
  let polishedMarkdown = markdown;

  if (workflow.route === "BRANCH_A") {
    onStage?.({
      agent: "reviewer",
      status: "completed",
      message: "Structure recovery route selected. Reviewer step skipped.",
      usage: normalizeAgentTokenUsage(reviewerUsage),
    });
    onStage?.({
      agent: "editor",
      status: "started",
      message: "Formatter Agent is restoring markdown structure...",
    });

    const formatterResult = await generateText({
      model: openai(model),
      abortSignal,
      maxOutputTokens: estimateMaxTokens("formatter", markdown.length),
      instructions: FORMATTER_SYSTEM_PROMPT,
      prompt: buildFormatterPrompt({
        markdown,
        rawBlocksResult: workflow.rawBlocksResult,
        codeRecoveryResult: workflow.codeRecoveryResult,
      }),
      providerOptions: getOpenAIProviderOptions("formatter"),
    });
    accumulateUsage(editorUsage, formatterResult);
    throwIfAborted();

    polishedMarkdown = formatterResult.text.trim() || markdown;
    review =
      "Applied deterministic structure recovery. Content wording was preserved conservatively.";
    keyImprovements = [
      "Detected unstructured/code-like input and routed to formatter mode.",
      "Recovered headings, lists, and code fences using precomputed structural hints.",
      "Skipped style rewriting to keep original meaning and factual details intact.",
    ];

    onStage?.({
      agent: "editor",
      status: "completed",
      message: "Formatter pass complete.",
      usage: normalizeAgentTokenUsage(editorUsage),
    });
  } else {
    onStage?.({
      agent: "reviewer",
      status: "started",
      message: "Reviewer Agent is analyzing clarity and flow...",
    });

    let reviewerResult = buildFallbackReviewerResult();
    let reviewerFailed = false;
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
      reviewerFailed = true;
      const isNoOutput = NoOutputGeneratedError.isInstance(error);
      if (isNoOutput) {
        console.warn("[ai-review] Reviewer returned no structured output, using conservative fallback.");
      } else {
        console.error("[ai-review] Reviewer agent failed, using fallback:", error);
      }
      onStage?.({
        agent: "reviewer",
        status: "completed",
        message: isNoOutput
          ? "Reviewer returned no structured output. Using conservative fallback."
          : `Reviewer agent encountered an error: ${error instanceof Error ? error.message : "unknown"}. Using conservative fallback.`,
        usage: normalizeAgentTokenUsage(reviewerUsage),
      });
    }

    review = reviewerResult.review;
    keyImprovements = reviewerResult.keyImprovements;

    if (!reviewerFailed) {
      onStage?.({
        agent: "reviewer",
        status: "completed",
        message: "Review pass complete.",
        usage: normalizeAgentTokenUsage(reviewerUsage),
      });
    }

    onStage?.({
      agent: "editor",
      status: "started",
      message: "Editor Agent is polishing with factual constraints...",
    });

    try {
      const editorResult = await generateText({
        model: openai(model),
        abortSignal,
        maxOutputTokens: estimateMaxTokens("editor", markdown.length),
        instructions: buildEditorInstructions(profile),
        prompt: buildEditorPrompt({
          markdown,
          reviewerResult,
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
      polishedMarkdown = markdown;
      onStage?.({
        agent: "editor",
        status: "completed",
        message: `Editor agent encountered an error: ${error instanceof Error ? error.message : "unknown"}. Original text preserved.`,
        usage: normalizeAgentTokenUsage(editorUsage),
      });
    }
  }

  if (!review) {
    review = "AI review completed.";
  }
  if (keyImprovements.length === 0) {
    keyImprovements = [
      "Output was generated with deterministic workflow controls.",
      "No additional improvement notes were returned by the model.",
      "Please inspect factual risk indicators before accepting changes.",
    ];
  }

  const before = normalizeMarkdownForCompare(markdown);
  const changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  const factualRisk = changed
    ? factualGuardWithBaseline(workflow.factualBaseline, polishedMarkdown)
    : { riskLevel: "low" as const, warnings: [] as string[], recommendation: "No changes were made; factual fidelity is intact." };

  return {
    review,
    keyImprovements,
    rewritePlan: [],
    editableReview: review,
    polishedMarkdown,
    changed,
    tokenUsage: {
      reviewer: normalizeAgentTokenUsage(reviewerUsage),
      editor: normalizeAgentTokenUsage(editorUsage),
    },
    toolInsights: {
      workflowRoute: workflow.route,
      structureRecoveryDetected: workflow.route === "BRANCH_A",
      editorSkipped: false,
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: workflow.codeRecoveryResult.recoveredBlockCount,
      factualRiskLevel: factualRisk.riskLevel,
      factualWarnings: factualRisk.warnings,
      factualRecommendation: factualRisk.recommendation,
    },
  };
}
