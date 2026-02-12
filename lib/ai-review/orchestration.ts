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
  REVIEWER_SYSTEM_PROMPT,
  EDITOR_SYSTEM_PROMPT,
} from "./prompts";
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
      reasoningTokens?: number;
      cachedInputTokens?: number;
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
  if (typeof usage.reasoningTokens === "number") {
    accumulator.reasoningTokens += usage.reasoningTokens;
  }
  if (typeof usage.cachedInputTokens === "number") {
    accumulator.cachedInputTokens += usage.cachedInputTokens;
  }
}

// ---------------------------------------------------------------------------
// Reviewer result helpers
// ---------------------------------------------------------------------------

function toReviewerResult(value: unknown): ReviewerResult | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as Partial<ReviewerResult>;
  if (
    typeof parsed.needsEdit !== "boolean" ||
    typeof parsed.review !== "string" ||
    !Array.isArray(parsed.keyImprovements) ||
    !Array.isArray(parsed.rewritePlan)
  ) {
    return null;
  }
  return {
    needsEdit: parsed.needsEdit,
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
    needsEdit: false,
    review:
      "No high-impact editorial issues detected; keep the original text with minimal intervention.",
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

export async function runDualAgentReview(params: {
  markdown: string;
  model: string;
  openai: ReturnType<typeof createOpenAI>;
  onStage?: (event: StageEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<AiReviewPayload> {
  const { markdown, model, openai, onStage, abortSignal } = params;
  const throwIfAborted = () => {
    if (!abortSignal?.aborted) return;
    const reason = abortSignal.reason;
    throw reason instanceof Error ? reason : new Error("Request aborted.");
  };

  throwIfAborted();
  const workflow = resolveWorkflowContext(markdown);
  const reviewerUsage = emptyAgentTokenUsage();
  const editorUsage = emptyAgentTokenUsage();
  let editorSkipped = false;
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
      system: FORMATTER_SYSTEM_PROMPT,
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

    const reviewerSchema = jsonSchema<ReviewerResult>({
      type: "object",
      properties: {
        needsEdit: { type: "boolean" },
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
      required: ["needsEdit", "review", "keyImprovements", "rewritePlan"],
      additionalProperties: false,
    });

    let reviewerResult = buildFallbackReviewerResult();
    let reviewerFailed = false;
    try {
      const reviewer = await generateText({
        model: openai(model),
        abortSignal,
        maxOutputTokens: estimateMaxTokens("reviewer", markdown.length),
        system: REVIEWER_SYSTEM_PROMPT,
        prompt: buildReviewerPrompt({
          markdown,
          structureSignals: workflow.structureSignals,
        }),
        output: Output.object({
          schema: reviewerSchema,
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
          ? "Reviewer returned no structured output. Using conservative fallback (no edits needed)."
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
    if (!reviewerResult.needsEdit) {
      editorSkipped = true;
      onStage?.({
        agent: "editor",
        status: "completed",
        message: "Reviewer determined no high-impact edits are needed. Editor step skipped.",
        usage: normalizeAgentTokenUsage(editorUsage),
      });
    } else {
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
          system: EDITOR_SYSTEM_PROMPT,
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
    polishedMarkdown,
    changed,
    tokenUsage: {
      reviewer: normalizeAgentTokenUsage(reviewerUsage),
      editor: normalizeAgentTokenUsage(editorUsage),
    },
    toolInsights: {
      workflowRoute: workflow.route,
      structureRecoveryDetected: workflow.route === "BRANCH_A",
      editorSkipped,
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
