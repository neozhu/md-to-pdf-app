import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { NextResponse } from "next/server";

import { sanitizeSuggestedPdfFileName } from "@/lib/document-filename";
import {
  FILENAME_SUGGESTION_MODEL,
  FILENAME_SUGGESTION_REASONING_EFFORT,
} from "@/lib/openai-models";

export const runtime = "nodejs";

const MAX_MARKDOWN_LEN = 20_000;

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

    const input = markdown.trim().slice(0, MAX_MARKDOWN_LEN);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Server missing OPENAI_API_KEY." },
        { status: 500 },
      );
    }

    const openai = createOpenAI({
      apiKey,
      ...(process.env.OPENAI_BASE_URL
        ? { baseURL: process.env.OPENAI_BASE_URL }
        : {}),
    });

    const result = await generateText({
      model: openai(FILENAME_SUGGESTION_MODEL),
      abortSignal: req.signal,
      maxOutputTokens: 64,
      system:
        "Generate a short, descriptive PDF filename for the document. Return only the filename, no explanation. Use 2 to 5 lowercase English words separated by hyphens. Keep the full filename under 48 characters including .pdf. Include .pdf.",
      prompt: [
        "Create a filename for this document:",
        "<document>",
        input,
        "</document>",
      ].join("\n"),
      providerOptions: {
        openai: {
          reasoningEffort: FILENAME_SUGGESTION_REASONING_EFFORT,
          textVerbosity: "low",
        },
      },
    });

    const fileName = sanitizeSuggestedPdfFileName(result.text);
    if (!fileName) {
      return NextResponse.json(
        { error: "AI response did not include a valid filename." },
        { status: 502 },
      );
    }

    return NextResponse.json({ fileName } satisfies { fileName: string });
  } catch (error) {
    if (req.signal.aborted) {
      return NextResponse.json({ error: "Request aborted." }, { status: 499 });
    }
    console.error("[api/filename-suggestion] Error:", error);
    return NextResponse.json(
      { error: "Filename suggestion failed." },
      { status: 500 },
    );
  }
}
