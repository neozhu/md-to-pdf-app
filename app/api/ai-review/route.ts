import { NextResponse } from "next/server";
import { generateText, jsonSchema, stepCountIs, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const runtime = "nodejs";

const MAX_MARKDOWN_LEN = 120_000;

type ReviewerResult = {
  review: string;
  keyImprovements: string[];
  rewritePlan: string[];
};

type AiReviewPayload = {
  review: string;
  keyImprovements: string[];
  polishedMarkdown: string;
  changed: boolean;
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

function normalizeMarkdownForCompare(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function tokenizeForSimilarity(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function wordJaccardSimilarity(a: string, b: string) {
  const setA = new Set(tokenizeForSimilarity(a));
  const setB = new Set(tokenizeForSimilarity(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  const union = new Set([...setA, ...setB]);
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionCount += 1;
  }
  return intersectionCount / Math.max(1, union.size);
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
  if (/^\s*[{[]/.test(lines.find((line) => line.trim()) ?? "") && /"\s*:/.test(joined)) {
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

function factualGuard(original: string, candidate: string): FactualGuardResult {
  const similarity = wordJaccardSimilarity(original, candidate);
  const normalizedOriginal = normalizeMarkdownForCompare(original);
  const normalizedCandidate = normalizeMarkdownForCompare(candidate);
  const lengthDelta =
    Math.abs(normalizedCandidate.length - normalizedOriginal.length) /
    Math.max(1, normalizedOriginal.length);

  const originalNumbers = extractUniqueMatches(
    original,
    /\b\d+(?:[.,]\d+)?%?\b/g,
    30,
  );
  const candidateNumbers = extractUniqueMatches(
    candidate,
    /\b\d+(?:[.,]\d+)?%?\b/g,
    30,
  );
  const originalUrls = extractUniqueMatches(
    original,
    /https?:\/\/[^\s)]+/g,
    20,
  );
  const candidateUrls = extractUniqueMatches(
    candidate,
    /https?:\/\/[^\s)]+/g,
    20,
  );
  const originalVersions = extractUniqueMatches(
    original,
    /\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/g,
    20,
  );
  const candidateVersions = extractUniqueMatches(
    candidate,
    /\bv?\d+\.\d+(?:\.\d+)?(?:-[0-9A-Za-z.-]+)?\b/g,
    20,
  );

  const missingNumbers = diffItems(originalNumbers, candidateNumbers);
  const addedNumbers = diffItems(candidateNumbers, originalNumbers);
  const missingUrls = diffItems(originalUrls, candidateUrls);
  const addedUrls = diffItems(candidateUrls, originalUrls);
  const missingVersions = diffItems(originalVersions, candidateVersions);
  const addedVersions = diffItems(candidateVersions, originalVersions);

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

function parseReviewerJson(text: string): ReviewerResult | null {
  try {
    const parsed = JSON.parse(text) as Partial<ReviewerResult>;
    if (
      typeof parsed.review === "string" &&
      Array.isArray(parsed.keyImprovements) &&
      Array.isArray(parsed.rewritePlan)
    ) {
      return {
        review: parsed.review,
        keyImprovements: parsed.keyImprovements.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ),
        rewritePlan: parsed.rewritePlan.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0,
        ),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function runDualAgentReview(params: {
  markdown: string;
  model: string;
  isReasoningModel: boolean;
  openai: ReturnType<typeof createOpenAI>;
  onStage?: (event: StageEvent) => void;
}): Promise<AiReviewPayload> {
  const { markdown, model, isReasoningModel, openai, onStage } = params;
  const structureSignals = buildStructureSignals(markdown);
  const needsStructureRecovery = structureSignals.isLikelyUnstructuredPlainText;
  const rawBlocksResult = parseRawBlocks(markdown, 40);
  const codeRecoveryResult = recoverCodeBlocks(markdown, {
    includeRecoveredMarkdown: markdown.length <= 6_000,
    maxSuggestions: 12,
  });

  onStage?.({
    agent: "reviewer",
    status: "started",
    message: needsStructureRecovery
      ? "Reviewing and rebuilding markdown structure..."
      : "Reviewing your draft for clarity, tone, and flow...",
  });

  const reviewerSystem = [
    "You are Reviewer Agent: an experienced editor for technical and business writing.",
    "First judge whether the input is structured markdown or plain text with lost formatting.",
    "Analyze markdown quality: clarity, structure, flow, tone consistency, grammar, concision, and readability.",
    "If structure is missing, prioritize recovery of title, section headings, lists, and code fences.",
    "Prefer practical improvements that noticeably improve readability without changing meaning.",
    "Do not invent new facts.",
    "Return strict JSON only, no markdown fences.",
  ].join(" ");
  const reviewerPrompt = [
    "Before final JSON output, call the `detectInputStructure` tool exactly once and use its result.",
    "Review the markdown and output JSON in this exact shape:",
    '{"review":"string","keyImprovements":["string"],"rewritePlan":["string"]}',
    "Requirements:",
    "- `review`: concise summary of optimization strategy, 1 sentence.",
    "- `keyImprovements`: 3-5 concrete issues only.",
    "- `rewritePlan`: 3-6 actionable rewrite instructions for an editor agent.",
    "- If formatting seems lost, include explicit structure-recovery steps (H1/H2/H3, lists, code fences).",
    "- Keep every instruction concrete and directly executable.",
    "",
    markdown,
  ].join("\n");

  const reviewer = await generateText({
    model: openai(model),
    ...(isReasoningModel ? {} : { temperature: 0.28 }),
    system: reviewerSystem,
    prompt: reviewerPrompt,
    tools: {
      detectInputStructure: tool({
        description:
          "Detect whether the input is likely unstructured plain text with lost markdown formatting.",
        inputSchema: jsonSchema<Record<string, never>>({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
        execute: async () => structureSignals,
      }),
    },
    toolChoice: "required",
    stopWhen: stepCountIs(2),
  });

  let reviewerResult = parseReviewerJson(reviewer.text);
  if (!reviewerResult) {
    const reviewerFallback = await generateText({
      model: openai(model),
      ...(isReasoningModel ? {} : { temperature: 0.28 }),
      system: reviewerSystem,
      prompt: reviewerPrompt,
    });
    reviewerResult = parseReviewerJson(reviewerFallback.text);
  }
  if (!reviewerResult) {
    throw new Error("Failed to parse reviewer output.");
  }

  onStage?.({
    agent: "reviewer",
    status: "completed",
    message: "Review pass complete.",
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
        "You are Editor Agent: an experienced editor rewriting markdown based on reviewer instructions.",
        "The input may be plain text copied from the web with formatting lost.",
        "Reconstruct clean, publishable markdown while preserving original meaning and factual claims.",
        "Add a sensible H1 title and H2/H3 subsection headings only when supported by source content.",
        "Convert inline enumerations into bullet or numbered lists where appropriate.",
        "Wrap code, commands, logs, JSON, or config-like fragments in fenced code blocks; add language only when obvious.",
        "Do not invent sections, claims, or examples not present in the source.",
        "Prefer structure recovery first, then sentence-level polish.",
        "Output polished markdown only. No explanations.",
      ]
    : [
        "You are Editor Agent: an experienced editor rewriting markdown based on reviewer instructions.",
        "Produce polished markdown only.",
        "Preserve meaning, factual claims, and markdown structure.",
        "Make moderate, meaningful edits that improve clarity and flow.",
        "Keep headings, paragraph order, and list structure unchanged unless a change is essential.",
        "Sentence-level rewrites are allowed when they make the text clearer.",
        "Avoid unnecessary stylistic rewrites.",
        "Do not add explanations, code fences, or comments.",
      ];

  const editor = await generateText({
    model: openai(model),
    ...(isReasoningModel ? {} : { temperature: 0.22 }),
    system: editorSystem.join(" "),
    prompt: [
      "Tool workflow requirements:",
      "1. Call `parseRawBlocks` once to inspect likely structure.",
      "2. If there are code candidates or code cues, call `recoverCodeBlocks` and apply the suggestions.",
      "3. Before final output, call `factualGuard` with your draft markdown as `candidate`, then fix any high-risk factual drift.",
      "4. Return polished markdown only.",
      "",
      "Reviewer summary:",
      reviewerResult.review,
      "",
      "Key improvements:",
      ...reviewerResult.keyImprovements.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      "Rewrite plan:",
      ...reviewerResult.rewritePlan.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      needsStructureRecovery
        ? "Important: structure the original into markdown (title/headings/lists/code fences) without adding new facts."
        : "Important: keep markdown structure stable unless essential for readability.",
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
        execute: async () => codeRecoveryResult,
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
        execute: async ({ candidate }) => factualGuard(markdown, candidate),
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

  const before = normalizeMarkdownForCompare(markdown);
  let polishedMarkdown = editor.text.trim();
  let changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  let factualRisk = polishedMarkdown
    ? factualGuard(markdown, polishedMarkdown)
    : null;

  if (!polishedMarkdown) {
    polishedMarkdown = markdown;
    changed = false;
    factualRisk = factualGuard(markdown, polishedMarkdown);
  } else if (
    (factualRisk?.riskLevel === "high" && !needsStructureRecovery) ||
    isOverEdited(markdown, polishedMarkdown, {
      allowStructureRebuild: needsStructureRecovery,
    })
  ) {
    onStage?.({
      agent: "editor",
      status: "started",
      message:
        factualRisk?.riskLevel === "high"
          ? "Reducing factual drift and tightening fidelity..."
          : "Tuning the draft for a lighter touch...",
    });
    const conservativeSystem = needsStructureRecovery
      ? [
          "You are Editor Agent.",
          "Your previous rewrite was too aggressive.",
          "Rebuild markdown structure conservatively from the original text.",
          "Keep factual content intact, and only add minimal headings/lists/code fences needed for readability.",
          "Output only markdown without explanations.",
        ]
      : [
          "You are Editor Agent.",
          "Apply a balanced polish with restrained rewrites.",
          "Keep structure and ordering intact.",
          "Improve clarity and rhythm, but avoid full paraphrasing.",
          "Preserve original facts, numbers, links, and versions unless clearly wrong in source.",
          "Output only markdown without explanations.",
        ];
    const conservativeRetry = await generateText({
      model: openai(model),
      ...(isReasoningModel ? {} : { temperature: 0.14 }),
      system: conservativeSystem.join(" "),
      prompt: [
        "Original markdown:",
        markdown,
        "",
        "Over-edited draft (for reference, do not copy large rewrites):",
        polishedMarkdown,
        "",
        factualRisk
          ? `Factual guard summary: risk=${factualRisk.riskLevel}; warnings=${factualRisk.warnings.join(" | ") || "none"}`
          : "",
        factualRisk
          ? `Missing numbers: ${factualRisk.missingNumbers.join(", ") || "none"}`
          : "",
        factualRisk
          ? `Missing urls: ${factualRisk.missingUrls.join(", ") || "none"}`
          : "",
        factualRisk
          ? `Missing versions: ${factualRisk.missingVersions.join(", ") || "none"}`
          : "",
        "",
        needsStructureRecovery
          ? "Now produce a conservative, clearly structured markdown version of the original."
          : "Now produce a lightly polished version of the original with minimal edits and high factual fidelity.",
      ].join("\n"),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "low",
        },
      },
    });

    const retried = conservativeRetry.text.trim();
    const retriedRisk = retried ? factualGuard(markdown, retried) : null;
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
    factualRisk = factualGuard(markdown, polishedMarkdown);
    changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;
  }

  onStage?.({
    agent: "editor",
    status: "completed",
    message: "Polish pass complete.",
  });

  return {
    review: reviewerResult.review,
    keyImprovements: reviewerResult.keyImprovements,
    polishedMarkdown,
    changed,
    toolInsights: {
      structureRecoveryDetected: needsStructureRecovery,
      structureCues: structureSignals.cues,
      rawBlockCount: rawBlocksResult.blockCount,
      headingCandidateCount: rawBlocksResult.headingCandidateCount,
      listCandidateCount: rawBlocksResult.listCandidateCount,
      codeCandidateCount: rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: codeRecoveryResult.recoveredBlockCount,
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
      });
      return NextResponse.json(result);
    }

    const encoder = new TextEncoder();
    const sendEvent = (
      controller: ReadableStreamDefaultController<Uint8Array>,
      event: string,
      data: unknown,
    ) => {
      controller.enqueue(
        encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
      );
    };

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        try {
          const result = await runDualAgentReview({
            markdown,
            model,
            isReasoningModel,
            openai,
            onStage: (stage) => sendEvent(controller, "stage", stage),
          });
          sendEvent(controller, "result", result);
        } catch (error) {
          sendEvent(controller, "error", {
            message: error instanceof Error ? error.message : "AI review failed.",
          });
        } finally {
          controller.close();
        }
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
