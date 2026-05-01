import { describe, expect, it } from "vitest";

import {
  DEFAULT_AI_REVIEW_MODEL,
  FILENAME_SUGGESTION_REASONING_EFFORT,
  FILENAME_SUGGESTION_MODEL,
} from "./openai-models";

describe("OpenAI model constants", () => {
  it("uses gpt-5-mini as the configurable AI review fallback model", () => {
    expect(DEFAULT_AI_REVIEW_MODEL).toBe("gpt-5-mini");
  });

  it("uses a backend-defined model for filename suggestions", () => {
    expect(FILENAME_SUGGESTION_MODEL).toBe("gpt-5-mini");
  });

  it("uses a gpt-5-mini supported reasoning effort for filename suggestions", () => {
    expect(FILENAME_SUGGESTION_REASONING_EFFORT).toBe("minimal");
  });
});
