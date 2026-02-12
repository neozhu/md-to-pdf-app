import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { runDualAgentReview } from "@/lib/ai-review";

export const runtime = "nodejs";

const MAX_MARKDOWN_LEN = 120_000;
const DEFAULT_MAX_INPUT_TOKENS = 30_000;

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
    const wantsStream =
      req.headers.get("accept")?.includes("text/event-stream") ||
      new URL(req.url).searchParams.get("stream") === "1";

    if (!wantsStream) {
      const result = await runDualAgentReview({
        markdown,
        model,
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
