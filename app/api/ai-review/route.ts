import { NextResponse } from "next/server";
import { generateText, jsonSchema, Output } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export const runtime = "nodejs";

const MAX_MARKDOWN_LEN = 120_000;
const DEFAULT_MAX_INPUT_TOKENS = 30_000;
const RAW_BLOCK_PREVIEW_LIMIT = 12;
const CODE_SUGGESTION_PREVIEW_LIMIT = 8;

const FORMATTER_SYSTEM_PROMPT = `You are a Strict Markdown Formatter.
Your ONLY goal is to convert the raw input text into valid, structured Markdown.

CRITICAL RULES:
1. NO REWRITING: Do not change, summarize, or improve the wording. Keep the original text exactly as is, word-for-word.
2. STRUCTURE RECOVERY:
   - Identify headings (H1/H2/H3) based on context and line length.
   - Convert implied lists (lines starting with "-", "*", "1.") into proper Markdown lists.
   - Fix broken paragraph indentation.
3. CODE FENCING:
   - You MAY add a '>' in front of a paragraph ONLY when the quote structure is explicitly implied by formatting.
   - Detect code snippets, logs, JSON, YAML, XML, shell output, or configuration blocks.
   - Wrap them in triple backticks (\`\`\`language) with the correct language tag.
   - If a code block is broken across lines, merge it back together.
4. SAFETY:
   - If you are unsure about a structure, leave it as a paragraph.
   - Do not hallucinate new content.

Output ONLY the formatted Markdown.`;

const REVIEWER_SYSTEM_PROMPT = `You are an expert Technical Editor-in-Chief.
You are reviewing Markdown content written by engineers for a professional audience.
You do NOT rewrite the content yourself.

Your responsibility is to ANALYZE and PLAN, not to edit.

Your Task:
1. Identify high-impact editorial issues related to:
   - Clarity: ambiguous statements or missing necessary context.
   - Flow: illogical ordering, abrupt topic shifts, or unnecessary repetition.
   - Tone Consistency: mixed formality or inconsistent assumptions about the reader.
   - Structure: long paragraphs covering multiple ideas, unclear section boundaries, or places where H1 / H2 / H3 headings are clearly needed but missing.
2. Produce a clear, actionable execution plan for a Junior Editor to fix these issues.

Output Schema (JSON):
{
  "review": "A single sentence summary of the strategic direction (e.g., 'Make it more professional and concise').",
  "keyImprovements": ["2-5 specific bullet points of what looks bad"],
  "rewritePlan": [
    "Step-by-step instructions for the editor.",
    "Example: 'Add an H2 heading before the paragraph that explains the authentication mechanism.'",
    "Example: 'Combine short sentences in the Intro section.'",
    "Example: 'Change the tone from casual to business professional.'"
  ]
}

PRIORITIZATION GUIDELINES:
- Prefer structural fixes over sentence-level changes.
- Prefer clarity and flow over tone polishing.
- Avoid low-impact wording suggestions if meaning is already clear.`;

const EDITOR_SYSTEM_PROMPT = `You are a Professional Markdown Editor.
Your goal is to polish the content based on the Reviewer's plan while strictly preserving factual data.

INPUT CONTEXT:
- Reviewer Plan: (See user input)
- Factual Constraints: (See user input - list of URLs/Numbers/Versions that MUST NOT change)

RULES:
1. EXECUTION: Follow the Reviewer's plan to improve clarity, flow, and tone.
2. FACTUAL FIDELITY (CRITICAL):
   - DO NOT change specific numbers, metrics, or version strings (e.g., "v1.2.3", "500ms").
   - DO NOT break or modify URLs/Links.
   - DO NOT change proper nouns or code variable names.
3. FORMATTING:
   - Maintain the existing heading hierarchy unless instructed otherwise.
   - Ensure all code blocks use proper fencing (\`\`\`).
4. OUTPUT:
   - Output ONLY the polished Markdown.
   - Do not include conversational filler (e.g., "Here is the polished version...").

If a sentence is ambiguous, choose the interpretation that preserves the original meaning most conservatively.`;

type WorkflowRoute = "BRANCH_A" | "BRANCH_B";

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
    workflowRoute: WorkflowRoute;
    structureRecoveryDetected: boolean;
    structureCues: string[];
    rawBlockCount: number;
    headingCandidateCount: number;
    listCandidateCount: number;
    codeCandidateCount: number;
    recoveredCodeBlockCount: number;
    factualRiskLevel: "low" | "medium" | "high";
    factualWarnings: string[];
    factualRecommendation: string;
    autoRetryApplied: false;
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

type PrecomputedWorkflowContext = {
  route: WorkflowRoute;
  structureSignals: StructureSignals;
  rawBlocksResult: RawBlocksResult;
  codeRecoveryResult: CodeRecoveryResult;
  factualBaseline: FactualBaseline;
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

function buildFallbackReviewerResult(): ReviewerResult {
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

function listPreview(items: string[], maxItems: number) {
  const limited = items.slice(0, maxItems);
  return limited.length > 0 ? limited.join(", ") : "none";
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

function resolveWorkflowContext(markdown: string): PrecomputedWorkflowContext {
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

function buildFormatterPrompt(params: {
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

function buildReviewerPrompt(params: {
  markdown: string;
  structureSignals: StructureSignals;
  rawBlocksResult: RawBlocksResult;
  codeRecoveryResult: CodeRecoveryResult;
}) {
  const { markdown, structureSignals, rawBlocksResult, codeRecoveryResult } = params;
  return [
    "Review the markdown and output JSON only (review/keyImprovements/rewritePlan).",
    "",
    "Precomputed Context:",
    `- Signals: unstructured=${structureSignals.isLikelyUnstructuredPlainText ? "yes" : "no"}, markdownSignals=${structureSignals.hasMarkdownSignals ? "yes" : "no"}, codeCueCount=${structureSignals.codeCueCount}`,
    `- Cues: ${structureSignals.cues.join(", ") || "none"}`,
    `- Raw blocks: total=${rawBlocksResult.blockCount}, headings=${rawBlocksResult.headingCandidateCount}, lists=${rawBlocksResult.listCandidateCount}, code=${rawBlocksResult.codeCandidateCount}`,
    `- Code recovery candidates: ${codeRecoveryResult.recoveredBlockCount}`,
    "",
    "Markdown:",
    markdown,
  ].join("\n");
}

function buildEditorPrompt(params: {
  markdown: string;
  reviewerResult: ReviewerResult;
  factualBaseline: FactualBaseline;
}) {
  const { markdown, reviewerResult, factualBaseline } = params;
  return [
    `Reviewer Plan: ${reviewerResult.review}`,
    `Specific Instructions:\n${reviewerResult.rewritePlan.join("\n")}`,
    "",
    "IMPERATIVE FACTUAL CONSTRAINTS (DO NOT CHANGE):",
    `- URLs: ${listPreview(factualBaseline.originalUrls, 40)}`,
    `- Numbers: ${listPreview(factualBaseline.originalNumbers, 60)}`,
    `- Versions: ${listPreview(factualBaseline.originalVersions, 40)}`,
    "",
    "Top Improvement Targets:",
    ...reviewerResult.keyImprovements.map((item, idx) => `${idx + 1}. ${item}`),
    "",
    "Original Markdown Content:",
    markdown,
  ].join("\n");
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
      ...(isReasoningModel ? {} : { temperature: 0 }),
      system: FORMATTER_SYSTEM_PROMPT,
      prompt: buildFormatterPrompt({
        markdown,
        rawBlocksResult: workflow.rawBlocksResult,
        codeRecoveryResult: workflow.codeRecoveryResult,
      }),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "low",
        },
      },
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

    let reviewerResult = buildFallbackReviewerResult();
    try {
      const reviewer = await generateText({
        model: openai(model),
        abortSignal,
        ...(isReasoningModel ? {} : { temperature: 0.3 }),
        system: REVIEWER_SYSTEM_PROMPT,
        prompt: buildReviewerPrompt({
          markdown,
          structureSignals: workflow.structureSignals,
          rawBlocksResult: workflow.rawBlocksResult,
          codeRecoveryResult: workflow.codeRecoveryResult,
        }),
        output: Output.object({
          schema: reviewerSchema,
          name: "reviewer_result",
        }),
        providerOptions: {
          openai: {
            reasoningEffort: "low",
            textVerbosity: "low",
          },
        },
      });
      accumulateUsage(reviewerUsage, reviewer);
      throwIfAborted();
      reviewerResult = toReviewerResult(reviewer.output) ?? buildFallbackReviewerResult();
    } catch (error) {
      if (abortSignal?.aborted) throw error;
    }

    review = reviewerResult.review;
    keyImprovements = reviewerResult.keyImprovements;

    onStage?.({
      agent: "reviewer",
      status: "completed",
      message: "Review pass complete.",
      usage: normalizeAgentTokenUsage(reviewerUsage),
    });
    onStage?.({
      agent: "editor",
      status: "started",
      message: "Editor Agent is polishing with factual constraints...",
    });

    const editorResult = await generateText({
      model: openai(model),
      abortSignal,
      ...(isReasoningModel ? {} : { temperature: 0.2 }),
      system: EDITOR_SYSTEM_PROMPT,
      prompt: buildEditorPrompt({
        markdown,
        reviewerResult,
        factualBaseline: workflow.factualBaseline,
      }),
      providerOptions: {
        openai: {
          reasoningEffort: "low",
          textVerbosity: "low",
        },
      },
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
  const factualRisk = factualGuardWithBaseline(
    workflow.factualBaseline,
    polishedMarkdown,
  );

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
      structureCues: workflow.structureSignals.cues,
      rawBlockCount: workflow.rawBlocksResult.blockCount,
      headingCandidateCount: workflow.rawBlocksResult.headingCandidateCount,
      listCandidateCount: workflow.rawBlocksResult.listCandidateCount,
      codeCandidateCount: workflow.rawBlocksResult.codeCandidateCount,
      recoveredCodeBlockCount: workflow.codeRecoveryResult.recoveredBlockCount,
      factualRiskLevel: factualRisk.riskLevel,
      factualWarnings: factualRisk.warnings,
      factualRecommendation: factualRisk.recommendation,
      autoRetryApplied: false,
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

    const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
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
