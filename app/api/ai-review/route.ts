import { NextResponse } from "next/server";
import { generateObject, generateText, jsonSchema, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const runtime = "nodejs";

const MAX_MARKDOWN_LEN = 120_000;
const DEFAULT_MAX_INPUT_TOKENS = 30_000;

type ReviewerResult = {
  review: string;
  keyImprovements: string[];
  rewritePlan: string[];
};

type AgentTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  calls: number;
};

type AgentTokenUsageSummary = {
  reviewer: AgentTokenUsage;
  editor: AgentTokenUsage;
};

type AiReviewPayload = {
  review: string;
  keyImprovements: string[];
  polishedMarkdown: string;
  changed: boolean;
  tokenUsage: AgentTokenUsageSummary;
  toolInsights: {
    structureRecoveryDetected: boolean;
    structureCues: string[];
    rawBlockCount: number;
    headingCandidateCount: number;
    listCandidateCount: number;
    codeCandidateCount: number;
    recoveredCodeBlockCount: number;
    factualRiskLevel: "low" | "medium" | "high";
    factualWarnings: string[];
  };
};

type StageEvent = {
  agent: "reviewer" | "editor";
  status: "started" | "completed";
  message: string;
  usage?: AgentTokenUsage;
};

type StructureSignals = {
  isLikelyUnstructuredPlainText: boolean;
  hasMarkdownSignals: boolean;
  hasParagraphBreak: boolean;
  nonEmptyLineCount: number;
  avgLineLength: number;
  headingLikeLineCount: number;
  codeCueCount: number;
  inlineListCueCount: number;
  cues: string[];
};

type RawBlockKind =
  | "heading_candidate"
  | "paragraph"
  | "list_candidate"
  | "code_candidate";

type RawBlock = {
  index: number;
  kind: RawBlockKind;
  startLine: number;
  endLine: number;
  lineCount: number;
  confidence: number;
  preview: string;
};

type RawBlocksResult = {
  blockCount: number;
  headingCandidateCount: number;
  listCandidateCount: number;
  codeCandidateCount: number;
  blocks: RawBlock[];
};

type CodeRecoverySuggestion = {
  startLine: number;
  endLine: number;
  language: string;
  confidence: number;
  preview: string;
};

type CodeRecoveryResult = {
  changed: boolean;
  recoveredBlockCount: number;
  candidateLineCount: number;
  suggestions: CodeRecoverySuggestion[];
  recoveredMarkdown?: string;
};

type FactualGuardResult = {
  riskLevel: "low" | "medium" | "high";
  similarity: number;
  lengthDelta: number;
  missingNumbers: string[];
  addedNumbers: string[];
  missingUrls: string[];
  addedUrls: string[];
  missingVersions: string[];
  addedVersions: string[];
  warnings: string[];
  recommendation: string;
};

type FactualBaseline = {
  normalizedOriginal: string;
  originalTokenSet: Set<string>;
  originalNumbers: string[];
  originalUrls: string[];
  originalVersions: string[];
};

function normalizeMarkdownForCompare(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function tokenizeForSimilarity(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function wordJaccardSimilarityFromSets(setA: Set<string>, setB: Set<string>) {
  if (setA.size === 0 && setB.size === 0) return 1;
  const union = new Set([...setA, ...setB]);
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionCount += 1;
  }
  return intersectionCount / Math.max(1, union.size);
}

function wordJaccardSimilarity(a: string, b: string) {
  return wordJaccardSimilarityFromSets(
    new Set(tokenizeForSimilarity(a)),
    new Set(tokenizeForSimilarity(b)),
  );
}

function estimateInputTokens(text: string) {
  // Heuristic: UTF-8 bytes are a better cross-language proxy than character count.
  const bytes = Buffer.byteLength(text, "utf8");
  return Math.ceil(bytes / 3.6);
}

function resolveMaxInputTokens() {
  const envValue = process.env.OPENAI_INPUT_TOKEN_LIMIT;
  if (!envValue) return DEFAULT_MAX_INPUT_TOKENS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_INPUT_TOKENS;
}

function buildStructureSignals(input: string): StructureSignals {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      isLikelyUnstructuredPlainText: false,
      hasMarkdownSignals: false,
      hasParagraphBreak: false,
      nonEmptyLineCount: 0,
      avgLineLength: 0,
      headingLikeLineCount: 0,
      codeCueCount: 0,
      inlineListCueCount: 0,
      cues: [],
    };
  }

  const hasMarkdownSignals =
    /^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|~~~)/m.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /!\[[^\]]*]\([^)]+\)/.test(trimmed) ||
    /^\s*\|.+\|\s*$/m.test(trimmed);
  const lines = trimmed.split(/\r?\n/);
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  const hasParagraphBreak = /\n\s*\n/.test(trimmed);
  const avgLineLength =
    nonEmptyLines.reduce((sum, line) => sum + line.trim().length, 0) /
    Math.max(1, nonEmptyLines.length);
  const headingLikeLineCount = nonEmptyLines.filter((line) => {
    const normalized = line.trim();
    if (normalized.length < 3 || normalized.length > 90) return false;
    const wordCount = normalized.split(/\s+/).length;
    if (wordCount > 12) return false;
    if (/[.!?。！？:：;；]$/.test(normalized)) return false;
    return true;
  }).length;
  const codeCueCount = nonEmptyLines.filter((line) =>
    /(```|~~~|=>|::|[{}[\]();]|<\/?[a-z]+>|^\s*(npm|pnpm|yarn|bun|node)\b|`)/i.test(
      line,
    ),
  ).length;
  const inlineListCueCount =
    (trimmed.match(/(?:^|\s)(?:\d+[.)]|[-*])\s+/gm) ?? []).length;
  const noMarkdownButLong = !hasMarkdownSignals && trimmed.length >= 260;

  const cues: string[] = [];
  if (nonEmptyLines.length <= 2 && trimmed.length >= 160) {
    cues.push("very-long-lines");
  }
  if (!hasParagraphBreak && avgLineLength >= 100 && trimmed.length >= 220) {
    cues.push("no-paragraph-breaks");
  }
  if (
    !hasMarkdownSignals &&
    trimmed.length >= 180 &&
    headingLikeLineCount >= 2
  ) {
    cues.push("heading-like-lines");
  }
  if (
    !hasMarkdownSignals &&
    trimmed.length >= 180 &&
    (codeCueCount >= 1 || inlineListCueCount >= 2)
  ) {
    cues.push("code-or-list-cues");
  }
  if (noMarkdownButLong) {
    cues.push("long-without-markdown");
  }

  const isLikelyUnstructuredPlainText = !hasMarkdownSignals && cues.length > 0;
  return {
    isLikelyUnstructuredPlainText,
    hasMarkdownSignals,
    hasParagraphBreak,
    nonEmptyLineCount: nonEmptyLines.length,
    avgLineLength,
    headingLikeLineCount,
    codeCueCount,
    inlineListCueCount,
    cues,
  };
}

function truncatePreview(input: string, maxLen = 180) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 3)}...`;
}

function lineCodeScore(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return 0;
  let score = 0;
  if (/^\s*(\$|>|npm|pnpm|yarn|bun|node|npx|git|curl)\b/i.test(trimmed)) {
    score += 0.55;
  }
  if (
    /(=>|::|[{}[\]();]|<\/?[a-z]+>|^[a-z_][a-z0-9_]*\s*=|`|import\s+|export\s+|function\s+|const\s+|let\s+)/i.test(
      trimmed,
    )
  ) {
    score += 0.4;
  }
  if (/^\s{4,}\S/.test(line)) {
    score += 0.35;
  }
  if (/^[-*+]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
    score -= 0.2;
  }
  if (/[.!?。！？]$/.test(trimmed) && !/[{}[\]();=<>]/.test(trimmed)) {
    score -= 0.2;
  }
  return Math.max(0, Math.min(1, score));
}

function detectCodeLanguage(lines: string[]) {
  const joined = lines.join("\n");
  const firstNonEmptyLine = lines.find((line) => line.trim()) ?? "";
  const looksLikeJsonStart = /^\s*[{[]/.test(firstNonEmptyLine);
  if (looksLikeJsonStart && /"\s*:/.test(joined)) {
    return "json";
  }
  if (/^\s*(\$|npm|pnpm|yarn|bun|node|npx|git|curl)\b/im.test(joined)) {
    return "bash";
  }
  if (/<\/?[a-z][^>]*>/i.test(joined)) {
    return "html";
  }
  if (/\b(import|export|const|let|function|interface|type|await)\b/.test(joined)) {
    return "ts";
  }
  if (/^\s*[A-Za-z0-9_-]+\s*:\s*\S+/m.test(joined) && !/[{};]/.test(joined)) {
    return "yaml";
  }
  return "";
}

function parseRawBlocks(text: string, maxBlocks = 80): RawBlocksResult {
  const lines = text.split(/\r?\n/);
  const blocks: RawBlock[] = [];
  let lineCursor = 0;

  while (lineCursor < lines.length && blocks.length < Math.max(1, maxBlocks)) {
    while (lineCursor < lines.length && lines[lineCursor].trim() === "") {
      lineCursor += 1;
    }
    if (lineCursor >= lines.length) break;

    const start = lineCursor;
    while (lineCursor < lines.length && lines[lineCursor].trim() !== "") {
      lineCursor += 1;
    }
    const end = lineCursor - 1;
    const chunk = lines.slice(start, end + 1);
    const joined = chunk.join("\n");
    const trimmedLines = chunk.map((line) => line.trim()).filter(Boolean);
    const lineCount = chunk.length;

    const listLineCount = trimmedLines.filter(
      (line) => /^([-*+]\s+|\d+[.)]\s+)/.test(line),
    ).length;
    const headingLikeCount = trimmedLines.filter((line) => {
      if (line.length < 3 || line.length > 90) return false;
      if (line.split(/\s+/).length > 12) return false;
      if (/[.!?。！？:：;；]$/.test(line)) return false;
      return true;
    }).length;
    const codeScores = trimmedLines.map((line) => lineCodeScore(line));
    const avgCodeScore =
      codeScores.reduce((sum, score) => sum + score, 0) /
      Math.max(1, codeScores.length);

    let kind: RawBlockKind = "paragraph";
    let confidence = 0.55;
    if (listLineCount >= Math.max(2, Math.ceil(trimmedLines.length * 0.6))) {
      kind = "list_candidate";
      confidence = 0.78;
    } else if (
      lineCount === 1 &&
      headingLikeCount === 1 &&
      !/^[a-z]/.test(trimmedLines[0] ?? "")
    ) {
      kind = "heading_candidate";
      confidence = 0.72;
    } else if (avgCodeScore >= 0.5 && lineCount >= 2) {
      kind = "code_candidate";
      confidence = Math.min(0.92, 0.55 + avgCodeScore * 0.45);
    }

    blocks.push({
      index: blocks.length,
      kind,
      startLine: start + 1,
      endLine: end + 1,
      lineCount,
      confidence,
      preview: truncatePreview(joined),
    });
  }

  return {
    blockCount: blocks.length,
    headingCandidateCount: blocks.filter((block) => block.kind === "heading_candidate")
      .length,
    listCandidateCount: blocks.filter((block) => block.kind === "list_candidate")
      .length,
    codeCandidateCount: blocks.filter((block) => block.kind === "code_candidate")
      .length,
    blocks,
  };
}

function recoverCodeBlocks(
  text: string,
  options?: { includeRecoveredMarkdown?: boolean; maxSuggestions?: number },
): CodeRecoveryResult {
  const includeRecoveredMarkdown = options?.includeRecoveredMarkdown ?? false;
  const maxSuggestions = Math.max(1, options?.maxSuggestions ?? 20);
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  const suggestions: CodeRecoverySuggestion[] = [];
  let inFence = false;
  let recoveredBlockCount = 0;
  let candidateLineCount = 0;
  let index = 0;

  const isFenceLine = (line: string) => /^\s*(```|~~~)/.test(line);
  const isListLine = (line: string) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);

  const shouldStartCodeBlock = (line: string, nextLine?: string) => {
    const trimmed = line.trim();
    if (!trimmed || isListLine(line)) return false;
    const score = lineCodeScore(line);
    const nextScore = nextLine ? lineCodeScore(nextLine) : 0;
    if (/^\s{4,}\S/.test(line) && score >= 0.35) return true;
    if (/^\s*(\$|npm|pnpm|yarn|bun|node|npx|git|curl)\b/i.test(trimmed)) {
      return true;
    }
    if (score >= 0.7) return true;
    if (score >= 0.45 && nextScore >= 0.35) return true;
    return false;
  };

  const shouldContinueCodeBlock = (line: string, nextLine?: string) => {
    if (!line.trim()) return Boolean(nextLine && lineCodeScore(nextLine) >= 0.4);
    if (isListLine(line) && lineCodeScore(line) < 0.55) return false;
    return lineCodeScore(line) >= 0.33 || /^\s{2,}\S/.test(line);
  };

  while (index < lines.length) {
    const line = lines[index];
    if (isFenceLine(line)) {
      inFence = !inFence;
      output.push(line);
      index += 1;
      continue;
    }

    if (inFence || !shouldStartCodeBlock(line, lines[index + 1])) {
      output.push(line);
      index += 1;
      continue;
    }

    const start = index;
    let end = index;
    while (end + 1 < lines.length && shouldContinueCodeBlock(lines[end + 1], lines[end + 2])) {
      end += 1;
    }
    const blockLines = lines.slice(start, end + 1);
    const language = detectCodeLanguage(blockLines);
    const confidence = Math.min(
      0.95,
      0.5 +
        blockLines.reduce((sum, blockLine) => sum + lineCodeScore(blockLine), 0) /
          Math.max(1, blockLines.length),
    );

    output.push(`\`\`\`${language}`);
    output.push(...blockLines);
    output.push("```");

    recoveredBlockCount += 1;
    candidateLineCount += blockLines.length;
    if (suggestions.length < maxSuggestions) {
      suggestions.push({
        startLine: start + 1,
        endLine: end + 1,
        language,
        confidence,
        preview: truncatePreview(blockLines.join("\n")),
      });
    }
    index = end + 1;
  }

  const recoveredMarkdown = output.join("\n");
  return {
    changed: recoveredMarkdown !== text,
    recoveredBlockCount,
    candidateLineCount,
    suggestions,
    ...(includeRecoveredMarkdown ? { recoveredMarkdown } : {}),
  };
}

function extractUniqueMatches(input: string, regex: RegExp, maxItems = 24) {
  const matches = input.match(regex) ?? [];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of matches) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= maxItems) break;
  }
  return unique;
}

function diffItems(source: string[], target: string[]) {
  const targetSet = new Set(target.map((item) => item.toLowerCase()));
  return source.filter((item) => !targetSet.has(item.toLowerCase()));
}

function buildFactualBaseline(original: string): FactualBaseline {
  return {
    normalizedOriginal: normalizeMarkdownForCompare(original),
    originalTokenSet: new Set(tokenizeForSimilarity(original)),
    originalNumbers: extractUniqueMatches(original, /\b\d+(?:[.,]\d+)?%?\b/g, 30),
    originalUrls: extractUniqueMatches(original, /https?:\/\/[^\s)]+/g, 20),
    originalVersions: extractUniqueMatches(
      original,
      /\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/g,
      20,
    ),
  };
}

function factualGuardWithBaseline(
  baseline: FactualBaseline,
  candidate: string,
): FactualGuardResult {
  const similarity = wordJaccardSimilarityFromSets(
    baseline.originalTokenSet,
    new Set(tokenizeForSimilarity(candidate)),
  );
  const normalizedCandidate = normalizeMarkdownForCompare(candidate);
  const lengthDelta =
    Math.abs(normalizedCandidate.length - baseline.normalizedOriginal.length) /
    Math.max(1, baseline.normalizedOriginal.length);

  const candidateNumbers = extractUniqueMatches(
    candidate,
    /\b\d+(?:[.,]\d+)?%?\b/g,
    30,
  );
  const candidateUrls = extractUniqueMatches(
    candidate,
    /https?:\/\/[^\s)]+/g,
    20,
  );
  const candidateVersions = extractUniqueMatches(
    candidate,
    /\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/g,
    20,
  );

  const missingNumbers = diffItems(baseline.originalNumbers, candidateNumbers);
  const addedNumbers = diffItems(candidateNumbers, baseline.originalNumbers);
  const missingUrls = diffItems(baseline.originalUrls, candidateUrls);
  const addedUrls = diffItems(candidateUrls, baseline.originalUrls);
  const missingVersions = diffItems(baseline.originalVersions, candidateVersions);
  const addedVersions = diffItems(candidateVersions, baseline.originalVersions);

  const warnings: string[] = [];
  if (missingUrls.length > 0) {
    warnings.push("Some source URLs disappeared after rewrite.");
  }
  if (missingVersions.length > 0) {
    warnings.push("Some version identifiers changed or were removed.");
  }
  if (missingNumbers.length >= 3) {
    warnings.push("Multiple numeric facts were removed.");
  }
  if (similarity < 0.45) {
    warnings.push("Candidate wording diverges heavily from the source.");
  }

  let riskLevel: FactualGuardResult["riskLevel"] = "low";
  if (
    missingUrls.length > 0 ||
    missingVersions.length > 0 ||
    missingNumbers.length >= 3 ||
    similarity < 0.45
  ) {
    riskLevel = "high";
  } else if (
    missingNumbers.length > 0 ||
    addedNumbers.length > 2 ||
    similarity < 0.62 ||
    lengthDelta > 0.7
  ) {
    riskLevel = "medium";
  }

  const recommendation =
    riskLevel === "high"
      ? "Re-edit conservatively and preserve original facts, numbers, versions, and links."
      : riskLevel === "medium"
        ? "Run a conservative pass to tighten factual consistency."
        : "Factual consistency looks stable.";

  return {
    riskLevel,
    similarity,
    lengthDelta,
    missingNumbers,
    addedNumbers,
    missingUrls,
    addedUrls,
    missingVersions,
    addedVersions,
    warnings,
    recommendation,
  };
}

function isOverEdited(
  original: string,
  rewritten: string,
  options?: { allowStructureRebuild?: boolean },
) {
  const allowStructureRebuild = options?.allowStructureRebuild ?? false;
  const normalizedOriginal = normalizeMarkdownForCompare(original);
  const normalizedRewritten = normalizeMarkdownForCompare(rewritten);
  const lengthDelta =
    Math.abs(normalizedRewritten.length - normalizedOriginal.length) /
    Math.max(1, normalizedOriginal.length);
  const similarity = wordJaccardSimilarity(normalizedOriginal, normalizedRewritten);
  const maxLengthDelta = allowStructureRebuild ? 1.2 : 0.45;
  const minSimilarity = allowStructureRebuild ? 0.28 : 0.62;
  return lengthDelta > maxLengthDelta || similarity < minSimilarity;
}

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

function buildFallbackReviewerResult(params: {
  needsStructureRecovery: boolean;
}): ReviewerResult {
  if (params.needsStructureRecovery) {
    return {
      review:
        "Rebuild markdown structure first, then apply a conservative readability polish while preserving facts.",
      keyImprovements: [
        "Formatting appears degraded and needs clear markdown hierarchy.",
        "Content blocks should be grouped into headings and short paragraphs.",
        "Code-like snippets should be fenced to preserve readability.",
      ],
      rewritePlan: [
        "Create a single H1 title from the main topic and add H2/H3 headings only when supported by source content.",
        "Split long runs of text into concise paragraphs and convert inline enumerations into bullet or numbered lists.",
        "Wrap commands/code/log/config fragments in fenced code blocks with language tags only when obvious.",
        "Preserve original facts, numbers, links, and version strings; avoid adding new claims.",
      ],
    };
  }
  return {
    review:
      "Apply a moderate polish that improves clarity and flow while keeping structure and meaning stable.",
    keyImprovements: [
      "Some sentences can be tightened for clarity and readability.",
      "Tone and phrasing can be made more consistent across sections.",
      "Minor grammar and concision improvements can reduce friction.",
    ],
    rewritePlan: [
      "Preserve existing heading/list order unless a change is essential for comprehension.",
      "Rewrite long or ambiguous sentences into concise, clear alternatives without changing factual meaning.",
      "Keep technical details, numbers, links, and versions intact.",
      "Return polished markdown only, without commentary.",
    ],
  };
}

function emptyAgentTokenUsage(): AgentTokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    calls: 0,
  };
}

function normalizeAgentTokenUsage(usage: AgentTokenUsage): AgentTokenUsage {
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

async function runDualAgentReview(params: {
  markdown: string;
  model: string;
  isReasoningModel: boolean;
  openai: ReturnType<typeof createOpenAI>;
  onStage?: (event: StageEvent) => void;
  abortSignal?: AbortSignal;
}): Promise<AiReviewPayload> {
  const { markdown, model, isReasoningModel, openai, onStage, abortSignal } =
    params;
  const throwIfAborted = () => {
    if (!abortSignal?.aborted) return;
    const reason = abortSignal.reason;
    throw reason instanceof Error ? reason : new Error("Request aborted.");
  };

  throwIfAborted();
  const structureSignals = buildStructureSignals(markdown);
  const needsStructureRecovery = structureSignals.isLikelyUnstructuredPlainText;
  const rawBlocksResult = parseRawBlocks(markdown, 40);
  let codeRecoveryResultMemo: CodeRecoveryResult | null = null;
  let codeRecoveryUsed = false;
  const getCodeRecoveryResult = () => {
    if (!codeRecoveryResultMemo) {
      codeRecoveryResultMemo = recoverCodeBlocks(markdown, {
        includeRecoveredMarkdown: markdown.length <= 6_000,
        maxSuggestions: 12,
      });
    }
    return codeRecoveryResultMemo;
  };
  const reviewerUsage = emptyAgentTokenUsage();
  const editorUsage = emptyAgentTokenUsage();
  const factualBaseline = buildFactualBaseline(markdown);

  onStage?.({
    agent: "reviewer",
    status: "started",
    message: needsStructureRecovery
      ? "Reviewing and rebuilding markdown structure..."
      : "Reviewing your draft for clarity, tone, and flow...",
  });

  const reviewerSystem = [
    "You are Reviewer Agent for technical and business markdown.",
    "Assess clarity, structure, flow, tone consistency, grammar, concision, and scanability.",
    "Prioritize high-impact issues and practical fixes over stylistic micro-edits.",
    "If formatting seems lost, prioritize structure recovery (headings/lists/fenced code).",
    "Preserve meaning and factual fidelity; do not invent claims.",
    "Keep guidance concrete and directly executable.",
  ].join(" ");
  const reviewerPrompt = [
    "Create reviewer guidance for the markdown below.",
    "review: one-sentence optimization strategy.",
    "keyImprovements: 3-5 concrete quality issues, ranked by impact.",
    "rewritePlan: 3-6 executable editing steps for an editor agent.",
    "When relevant, include structure-specific steps (heading hierarchy, paragraph chunking, list normalization, code fence recovery).",
    "Avoid vague advice; each step should imply a direct edit action.",
    "",
    `Signals: unstructured=${needsStructureRecovery ? "yes" : "no"}; cues=${structureSignals.cues.join(", ") || "none"}; lines=${structureSignals.nonEmptyLineCount}; avgLine=${structureSignals.avgLineLength.toFixed(1)}.`,
    "",
    "Markdown:",
    markdown,
  ].join("\n");
  const reviewerSchema = jsonSchema<ReviewerResult>({
    type: "object",
    properties: {
      review: { type: "string", minLength: 1 },
      keyImprovements: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 5,
      },
      rewritePlan: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 6,
      },
    },
    required: ["review", "keyImprovements", "rewritePlan"],
    additionalProperties: false,
  });

  let reviewerResult = buildFallbackReviewerResult({
    needsStructureRecovery,
  });
  try {
    const reviewer = await generateObject({
      model: openai(model),
      abortSignal,
      ...(isReasoningModel ? {} : { temperature: 0.28 }),
      system: reviewerSystem,
      prompt: reviewerPrompt,
      schema: reviewerSchema,
      schemaName: "reviewer_result",
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "low",
        },
      },
    });
    accumulateUsage(reviewerUsage, reviewer);
    throwIfAborted();
    reviewerResult =
      toReviewerResult(reviewer.object) ??
      buildFallbackReviewerResult({ needsStructureRecovery });
  } catch (error) {
    if (abortSignal?.aborted) throw error;
  }

  onStage?.({
    agent: "reviewer",
    status: "completed",
    message: "Review pass complete.",
    usage: normalizeAgentTokenUsage(reviewerUsage),
  });

  onStage?.({
    agent: "editor",
    status: "started",
    message: needsStructureRecovery
      ? "Reconstructing markdown structure and polishing..."
      : "Polishing wording and readability...",
  });

  const editorSystem = needsStructureRecovery
    ? [
        "You are Editor Agent.",
        "Output polished markdown only.",
        "Input may have lost formatting; rebuild clean, publishable markdown structure first.",
        "Use minimal H1/H2/H3, list normalization, and fenced code blocks when supported by source content.",
        "Improve readability with concise paragraphs and clear information hierarchy.",
        "Preserve facts and meaning; do not invent claims, examples, or unsupported sections.",
      ]
    : [
        "You are Editor Agent.",
        "Output polished markdown only.",
        "Improve clarity, flow, grammar, and concision with a consistent professional tone.",
        "Preserve meaning, facts, numbers, links, versions, and markdown structure.",
        "Keep heading/list order stable unless a change is clearly necessary for readability.",
        "Prefer moderate rewrites; avoid full paraphrasing or ornamental style shifts.",
      ];

  const editor = await generateText({
    model: openai(model),
    abortSignal,
    ...(isReasoningModel ? {} : { temperature: 0.22 }),
    system: editorSystem.join(" "),
    prompt: [
      "Workflow rules:",
      "- Call parseRawBlocks once.",
      "- Call recoverCodeBlocks only when code cues/candidates matter.",
      "- Call factualGuard on your draft; if risk is high, repair factual drift before final output.",
      "",
      "Quality targets: high readability, coherent hierarchy, concise wording, and factual precision.",
      "",
      `Reviewer summary: ${reviewerResult.review}`,
      "",
      "Key improvements:",
      ...reviewerResult.keyImprovements.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      "Rewrite plan:",
      ...reviewerResult.rewritePlan.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      needsStructureRecovery
        ? "Mode: structure recovery with conservative factual fidelity."
        : "Mode: light-to-moderate polish with structure stability.",
      "",
      "Original markdown:",
      markdown,
    ].join("\n"),
    tools: {
      parseRawBlocks: tool({
        description:
          "Parse unstructured text into candidate blocks (heading/list/code/paragraph) for markdown reconstruction.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => rawBlocksResult,
      }),
      recoverCodeBlocks: tool({
        description:
          "Suggest fenced code-block recoveries for likely code/log/config segments.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => {
          codeRecoveryUsed = true;
          return getCodeRecoveryResult();
        },
      }),
      factualGuard: tool({
        description:
          "Check factual drift between source markdown and candidate markdown (numbers, URLs, versions, similarity).",
        inputSchema: jsonSchema<{ candidate: string }>({
          type: "object",
          properties: {
            candidate: { type: "string", minLength: 1 },
          },
          required: ["candidate"],
          additionalProperties: false,
        }),
        execute: async ({ candidate }) =>
          factualGuardWithBaseline(factualBaseline, candidate),
      }),
    },
    toolChoice: "auto",
    stopWhen: stepCountIs(6),
    providerOptions: {
      openai: {
        reasoningEffort: "low",
        textVerbosity: "low",
      },
    },
  });
  accumulateUsage(editorUsage, editor);
  throwIfAborted();

  const before = normalizeMarkdownForCompare(markdown);
  let polishedMarkdown = editor.text.trim();
  let changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  let factualRisk = polishedMarkdown
    ? factualGuardWithBaseline(factualBaseline, polishedMarkdown)
    : null;

  if (!polishedMarkdown) {
    polishedMarkdown = markdown;
    changed = false;
    factualRisk = factualGuardWithBaseline(factualBaseline, polishedMarkdown);
  } else if (factualRisk?.riskLevel === "high") {
    onStage?.({
      agent: "editor",
      status: "started",
      message: "Reducing factual drift and tightening fidelity...",
    });
    const conservativeSystem = needsStructureRecovery
      ? [
          "You are Editor Agent.",
          "Previous rewrite introduced factual drift.",
          "Rebuild markdown conservatively from the original source.",
          "Use minimal headings/lists/code fences only when clearly supported.",
          "Prioritize factual fidelity over style improvements.",
          "Output markdown only.",
        ]
      : [
          "You are Editor Agent.",
          "Apply restrained edits only.",
          "Keep structure/order intact and avoid full paraphrasing.",
          "Preserve facts, numbers, links, and versions with high precision.",
          "Favor minimal-change repairs that reduce drift.",
          "Output markdown only.",
        ];
    const conservativeRetry = await generateText({
      model: openai(model),
      abortSignal,
      ...(isReasoningModel ? {} : { temperature: 0.14 }),
      system: conservativeSystem.join(" "),
      prompt: [
        "Original markdown:",
        markdown,
        "",
        "Current draft:",
        polishedMarkdown,
        "",
        factualRisk
          ? `Risk=${factualRisk.riskLevel}; warnings=${factualRisk.warnings.join(" | ") || "none"}`
          : "",
        factualRisk
          ? `Missing numbers: ${factualRisk.missingNumbers.join(", ") || "none"}`
          : "",
        factualRisk
          ? `Missing URLs: ${factualRisk.missingUrls.join(", ") || "none"}`
          : "",
        factualRisk
          ? `Missing versions: ${factualRisk.missingVersions.join(", ") || "none"}`
          : "",
        "",
        needsStructureRecovery
          ? "Return a conservative structured markdown version."
          : "Return a lightly polished, high-fidelity version.",
      ].join("\n"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "low",
        },
      },
    });
    accumulateUsage(editorUsage, conservativeRetry);
    throwIfAborted();

    const retried = conservativeRetry.text.trim();
    const retriedRisk = retried
      ? factualGuardWithBaseline(factualBaseline, retried)
      : null;
    if (
      retried &&
      retriedRisk?.riskLevel !== "high" &&
      !isOverEdited(markdown, retried, {
        allowStructureRebuild: needsStructureRecovery,
      })
    ) {
      polishedMarkdown = retried;
    } else if (retried) {
      const firstScore = wordJaccardSimilarity(markdown, polishedMarkdown);
      const retryScore = wordJaccardSimilarity(markdown, retried);
      const firstRiskScore =
        factualRisk?.riskLevel === "high"
          ? 0
          : factualRisk?.riskLevel === "medium"
            ? 1
            : 2;
      const retryRiskScore =
        retriedRisk?.riskLevel === "high"
          ? 0
          : retriedRisk?.riskLevel === "medium"
            ? 1
            : 2;
      if (retryRiskScore > firstRiskScore) {
        polishedMarkdown = retried;
      } else if (retryRiskScore === firstRiskScore) {
        polishedMarkdown = retryScore >= firstScore ? retried : polishedMarkdown;
      }
    } else if (
      isOverEdited(markdown, polishedMarkdown, {
        allowStructureRebuild: needsStructureRecovery,
      })
    ) {
      polishedMarkdown = markdown;
    }
    factualRisk = factualGuardWithBaseline(factualBaseline, polishedMarkdown);
    changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  }

  onStage?.({
    agent: "editor",
    status: "completed",
    message: "Polish pass complete.",
    usage: normalizeAgentTokenUsage(editorUsage),
  });

  return {
    review: reviewerResult.review,
    keyImprovements: reviewerResult.keyImprovements,
    polishedMarkdown,
    changed,
    tokenUsage: {
      reviewer: normalizeAgentTokenUsage(reviewerUsage),
      editor: normalizeAgentTokenUsage(editorUsage),
    },
    toolInsights: {
      structureRecoveryDetected: needsStructureRecovery,
      structureCues: structureSignals.cues,
      rawBlockCount: rawBlocksResult.blockCount,
      headingCandidateCount: rawBlocksResult.headingCandidateCount,
      listCandidateCount: rawBlocksResult.listCandidateCount,
      codeCandidateCount: rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: codeRecoveryUsed
        ? getCodeRecoveryResult().recoveredBlockCount
        : 0,
      factualRiskLevel: factualRisk?.riskLevel ?? "low",
      factualWarnings: factualRisk?.warnings ?? [],
    },
  };
}

export async function POST(req: Request) {
  try {
    const { markdown } = (await req.json().catch(() => ({}))) as {
      markdown?: unknown;
    };

    if (typeof markdown !== "string" || !markdown.trim()) {
      return NextResponse.json(
        { error: "Missing or empty markdown." },
        { status: 400 },
      );
    }

    if (markdown.length > MAX_MARKDOWN_LEN) {
      return NextResponse.json(
        { error: `Markdown too large (max ${MAX_MARKDOWN_LEN} chars).` },
        { status: 413 },
      );
    }

    const estimatedInputTokens = estimateInputTokens(markdown);
    const maxInputTokens = resolveMaxInputTokens();
    if (estimatedInputTokens > maxInputTokens) {
      return NextResponse.json(
        {
          error: `Markdown too large (estimated ${estimatedInputTokens} input tokens; limit ${maxInputTokens}).`,
        },
        { status: 413 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const baseUrl = process.env.OPENAI_BASE_URL;
    const openai = createOpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    const isReasoningModel = /^(gpt-5|o1|o3|o4)/i.test(model);
    const wantsStream =
      req.headers.get("accept")?.includes("text/event-stream") ||
      new URL(req.url).searchParams.get("stream") === "1";

    if (!wantsStream) {
      const result = await runDualAgentReview({
        markdown,
        model,
        isReasoningModel,
        openai,
        abortSignal: req.signal,
      });
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const sendEvent = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      event: string,
      data: unknown,
    ) => {
      try {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      } catch {
        // Ignore enqueue errors if stream is already closed/canceled.
      }
    };
    const streamAbortController = new AbortController();
    const abortStreamWork = (reason?: unknown) => {
      if (!streamAbortController.signal.aborted) {
        streamAbortController.abort(reason);
      }
    };
    req.signal.addEventListener(
      "abort",
      () => abortStreamWork(req.signal.reason),
      { once: true },
    );

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const result = await runDualAgentReview({
            markdown,
            model,
            isReasoningModel,
            openai,
            onStage: (stage) => sendEvent(controller, "stage", stage),
            abortSignal: streamAbortController.signal,
          });
          sendEvent(controller, "result", result);
        } catch (error) {
          if (!streamAbortController.signal.aborted) {
            sendEvent(controller, "error", {
              message: error instanceof Error ? error.message : "AI review failed.",
            });
          }
        } finally {
          try {
            controller.close();
          } catch {
            // Stream may already be closed/canceled by the client.
          }
        }
      },
      cancel: (reason) => {
        abortStreamWork(reason);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("[api/ai-review] Error:", error);
    return NextResponse.json({ error: "AI review failed." }, { status: 500 });
  }
}
