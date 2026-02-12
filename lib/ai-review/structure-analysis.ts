// ---------------------------------------------------------------------------
// Pure heuristic functions for analysing raw markdown structure.
// No AI SDK dependency — these are deterministic and highly testable.
// ---------------------------------------------------------------------------

import type {
  CodeRecoveryResult,
  CodeRecoverySuggestion,
  RawBlock,
  RawBlockKind,
  RawBlocksResult,
  StructureSignals,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function truncatePreview(input: string, maxLen = 180) {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 3)}...`;
}

/**
 * Count "words" in a way that works for both Latin and CJK text.
 * Latin words are space-separated tokens; each CJK character counts as one word.
 */
function countWords(text: string): number {
  // Match CJK ideograph ranges
  const cjkChars = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g);
  const cjkCount = cjkChars?.length ?? 0;
  // Remove CJK characters, then count remaining space-separated tokens
  const withoutCjk = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, " ");
  const latinWords = withoutCjk.split(/\s+/).filter((t) => t.length > 0);
  return cjkCount + latinWords.length;
}

/** Detect and strip YAML frontmatter (--- ... ---) from text. */
function stripFrontmatter(text: string): { body: string; hasFrontmatter: boolean } {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  if (!match) return { body: text, hasFrontmatter: false };
  return { body: text.slice(match[0].length), hasFrontmatter: true };
}

// ---------------------------------------------------------------------------
// Structure signals
// ---------------------------------------------------------------------------

export function buildStructureSignals(input: string): StructureSignals {
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

// ---------------------------------------------------------------------------
// Per-line code likelihood scorer
// ---------------------------------------------------------------------------

export function lineCodeScore(line: string) {
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

// ---------------------------------------------------------------------------
// Code language detection
// ---------------------------------------------------------------------------

export function detectCodeLanguage(lines: string[]) {
  const joined = lines.join("\n");
  const firstNonEmptyLine = lines.find((line) => line.trim()) ?? "";
  const looksLikeJsonStart = /^\s*[{[]/.test(firstNonEmptyLine);
  if (looksLikeJsonStart && /"\s*:/.test(joined)) {
    return "json";
  }
  if (/^\s*(\$|npm|pnpm|yarn|bun|node|npx|git|curl)\b/im.test(joined)) {
    return "bash";
  }
  if (/<\/?[a-z][^>]*>/i.test(joined) && !/\b(import|export|const|let)\b/.test(joined)) {
    return "html";
  }
  // Python: def/class/import with colon or common builtins
  if (/\b(def\s+\w+|class\s+\w+|from\s+\w+\s+import|print\s*\()/.test(joined)) {
    return "python";
  }
  // Go: func/package/import with Go-style syntax
  if (/\b(func\s+\w+|package\s+\w+|fmt\.\w+)/.test(joined)) {
    return "go";
  }
  // Rust: fn/let mut/impl/pub fn
  if (/\b(fn\s+\w+|let\s+mut\s|impl\s+\w+|pub\s+fn)/.test(joined)) {
    return "rust";
  }
  // C#: using/namespace/public class/void
  if (/\b(using\s+\w+|namespace\s+\w+|public\s+(class|void|static))/.test(joined)) {
    return "csharp";
  }
  // SQL: SELECT/INSERT/UPDATE/CREATE TABLE
  if (/\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|CREATE\s+TABLE)\b/i.test(joined)) {
    return "sql";
  }
  // CSS: selectors with { property: value }
  if (/[.#]?[a-z][\w-]*\s*\{[^}]*:[^}]+\}/i.test(joined) && !/\b(function|const|let|var)\b/.test(joined)) {
    return "css";
  }
  if (/\b(import|export|const|let|function|interface|type|await)\b/.test(joined)) {
    return "ts";
  }
  if (/^\s*[A-Za-z0-9_-]+\s*:\s*\S+/m.test(joined) && !/[{};]/.test(joined)) {
    return "yaml";
  }
  return "";
}

// ---------------------------------------------------------------------------
// Raw block parser
// ---------------------------------------------------------------------------

export function parseRawBlocks(text: string, maxBlocks = 80): RawBlocksResult {
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
      if (countWords(line) > 12) return false;
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
      countWords(trimmedLines[0] ?? "") <= 12
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

// ---------------------------------------------------------------------------
// Deterministic code fence recovery
// ---------------------------------------------------------------------------

export function recoverCodeBlocks(
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
