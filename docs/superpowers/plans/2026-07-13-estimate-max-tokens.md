# `estimateMaxTokens` Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give reviewer and editor calls stage-appropriate output budgets with explicit reasoning headroom.

**Architecture:** Keep the existing `estimateMaxTokens(stage, inputLength)` boundary and both call sites. Export the pure helper for direct unit testing, use file-local constants for the reviewer budget and editor calculation, and leave prompts, provider options, and fallback paths unchanged.

**Tech Stack:** TypeScript, Vitest, Vercel AI SDK

## Global Constraints

- Reviewer budget is exactly 8,192 tokens.
- Editor budget is `ceil(inputLength / 3) + 4,096`, clamped to 8,192–32,768 tokens.
- Do not change prompts, models, provider options, reasoning effort, call sites, or fallback behavior.
- Do not add dependencies or unrelated refactoring.

---

### Task 1: Stage-specific token budgets

**Files:**
- Modify: `lib/ai-review/orchestration.ts:250`
- Test: `lib/ai-review/orchestration.test.ts`

**Interfaces:**
- Consumes: `OpenAIStage` with `"reviewer" | "editor"` and Markdown character length as a number.
- Produces: exported `estimateMaxTokens(stage: OpenAIStage, inputLength: number): number`; existing `runReviewPass` and `runPolishPass` continue consuming it unchanged.

- [ ] **Step 1: Write the failing tests**

Update the import and add a focused describe block:

```ts
import {
  buildPolishDisplayReviewerResult,
  estimateMaxTokens,
} from "./orchestration";

describe("estimateMaxTokens", () => {
  it("reserves a fixed reasoning budget for the reviewer", () => {
    expect(estimateMaxTokens("reviewer", 0)).toBe(8192);
    expect(estimateMaxTokens("reviewer", 100_000)).toBe(8192);
  });

  it("uses the minimum editor budget for short input", () => {
    expect(estimateMaxTokens("editor", 0)).toBe(8192);
  });

  it("adds reasoning headroom to the estimated editor output", () => {
    expect(estimateMaxTokens("editor", 30_000)).toBe(14_096);
  });

  it("caps the editor budget for long input", () => {
    expect(estimateMaxTokens("editor", 100_000)).toBe(32_768);
  });
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `pnpm test lib/ai-review/orchestration.test.ts`

Expected: FAIL because `estimateMaxTokens` is not exported and the old budgets do not meet the assertions.

- [ ] **Step 3: Implement the minimal calculation**

Replace the current helper with:

```ts
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
```

- [ ] **Step 4: Run the targeted test and verify GREEN**

Run: `pnpm test lib/ai-review/orchestration.test.ts`

Expected: the orchestration test file passes with no errors or warnings.

- [ ] **Step 5: Run narrow repository checks**

Run: `pnpm eslint lib/ai-review/orchestration.ts lib/ai-review/orchestration.test.ts`

Expected: exit code 0.

Run: `pnpm exec tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 6: Review and commit the implementation**

Run: `git diff --check` and inspect `git diff -- lib/ai-review/orchestration.ts lib/ai-review/orchestration.test.ts`.

Expected: only the token-budget helper, its constants, export, and focused tests changed.

```bash
git add lib/ai-review/orchestration.ts lib/ai-review/orchestration.test.ts docs/superpowers/plans/2026-07-13-estimate-max-tokens.md
git commit -m "refactor: clarify AI review token budgets"
```
