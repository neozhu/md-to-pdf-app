import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => vi.fn((model: string) => ({ model }))),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async () => ({ text: "project-summary.pdf" })),
}));

describe("filename suggestion route", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
  });

  it("only sends the first 500 trimmed markdown characters to the model", async () => {
    process.env.OPENAI_API_KEY = "test-api-key";
    const markdown = `  ${"a".repeat(500)}${"b".repeat(100)}  `;

    const response = await POST(
      new Request("http://localhost/api/filename-suggestion", {
        method: "POST",
        body: JSON.stringify({ markdown }),
      }),
    );

    expect(response.status).toBe(200);
    expect(createOpenAI).toHaveBeenCalledWith({ apiKey: "test-api-key" });
    const prompt = vi.mocked(generateText).mock.calls[0]?.[0].prompt;
    expect(prompt).toContain("a".repeat(500));
    expect(prompt).not.toContain("b");
  });
});
