// ---------------------------------------------------------------------------
// Factual fidelity guard — compares original and candidate markdown to detect
// accidental changes to numbers, URLs, versions, or overall wording.
// Pure functions, no AI SDK dependency.
// ---------------------------------------------------------------------------

import type { FactualBaseline, FactualGuardResult } from "./types";

// ---------------------------------------------------------------------------
// Text normalisation helpers
// ---------------------------------------------------------------------------

export function normalizeMarkdownForCompare(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

export function tokenizeForSimilarity(input: string) {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

export function wordJaccardSimilarityFromSets(setA: Set<string>, setB: Set<string>) {
  if (setA.size === 0 && setB.size === 0) return 1;
  const union = new Set([...setA, ...setB]);
  let intersectionCount = 0;
  for (const token of setA) {
    if (setB.has(token)) intersectionCount += 1;
  }
  return intersectionCount / Math.max(1, union.size);
}

// ---------------------------------------------------------------------------
// Regex extraction helpers
// ---------------------------------------------------------------------------

export function extractUniqueMatches(input: string, regex: RegExp, maxItems = 24) {
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

export function diffItems(source: string[], target: string[]) {
  const targetSet = new Set(target.map((item) => item.toLowerCase()));
  return source.filter((item) => !targetSet.has(item.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Baseline builder
// ---------------------------------------------------------------------------

export function buildFactualBaseline(original: string): FactualBaseline {
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

// ---------------------------------------------------------------------------
// Guard: compare candidate against baseline
// ---------------------------------------------------------------------------

export function factualGuardWithBaseline(
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
