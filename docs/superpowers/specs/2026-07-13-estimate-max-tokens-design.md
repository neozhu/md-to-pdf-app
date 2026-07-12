# `estimateMaxTokens` Optimization Design

## Goal

Make the AI review token budget reflect the different output needs of the reviewer and editor stages while keeping the change small and predictable.

## Current behavior

- The reviewer always receives 4,096 output tokens.
- The editor receives approximately half the Markdown character count as output tokens, clamped between 2,048 and 16,384.
- `maxOutputTokens` includes both visible output and reasoning tokens, so the current reviewer budget can be consumed before structured output is produced.
- The editor estimate mixes visible-output sizing and reasoning headroom into one multiplier, which makes the intent difficult to understand and caps long documents aggressively.

## Design

Keep `estimateMaxTokens(stage, inputLength)` and its two existing call sites unchanged.

- Reviewer: return a fixed budget of 8,192 tokens. Its structured output is short, but medium reasoning effort needs explicit headroom.
- Editor: estimate visible output as `ceil(inputLength / 3)`, add 4,096 tokens of reasoning headroom, then clamp the result to 8,192–32,768 tokens.
- Define descriptive file-local constants for these budgets so the calculation documents its own intent.
- Do not change prompts, models, provider options, reasoning effort, or fallback behavior.

## Error handling

No new error handling or retry behavior is introduced. Existing review fallback and editor original-text preservation remain unchanged.

## Verification

Add focused unit tests for:

- the fixed reviewer budget;
- the editor minimum for short input;
- the editor proportional calculation for medium input;
- the editor maximum for long input.

Run the targeted test first, then the repository's narrowest relevant type or lint check if available.

## Scope

Only `lib/ai-review/orchestration.ts`, its direct test file, and this design document are in scope. No adjacent refactoring is included.
