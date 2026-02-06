import { NextResponse } from "next/server";
import { generateText } from "ai";
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
};

type StageEvent = {
  agent: "reviewer" | "editor";
  status: "started" | "completed";
  message: string;
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

function isOverEdited(original: string, rewritten: string) {
  const normalizedOriginal = normalizeMarkdownForCompare(original);
  const normalizedRewritten = normalizeMarkdownForCompare(rewritten);
  const lengthDelta =
    Math.abs(normalizedRewritten.length - normalizedOriginal.length) /
    Math.max(1, normalizedOriginal.length);
  const similarity = wordJaccardSimilarity(normalizedOriginal, normalizedRewritten);
  return lengthDelta > 0.45 || similarity < 0.62;
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

  onStage?.({
    agent: "reviewer",
    status: "started",
    message: "Reviewing your draft for clarity, tone, and flow...",
  });

  const reviewer = await generateText({
    model: openai(model),
    ...(isReasoningModel ? {} : { temperature: 0.28 }),
    system: [
      "You are Reviewer Agent: an experienced editor for technical and business writing.",
      "Analyze markdown quality: clarity, structure, flow, tone consistency, grammar, concision, and readability.",
      "Prefer practical improvements that noticeably improve readability without changing meaning.",
      "Do not invent new facts.",
      "Return strict JSON only.",
    ].join(" "),
    prompt: [
      "Review the markdown and output JSON in this exact shape:",
      '{"review":"string","keyImprovements":["string"],"rewritePlan":["string"]}',
      "Requirements:",
      "- `review`: concise summary of optimization strategy, 1 sentence.",
      "- `keyImprovements`: 3-5 concrete issues only.",
      "- `rewritePlan`: 3-6 actionable rewrite instructions for an editor agent.",
      "",
      markdown,
    ].join("\n"),
  });

  const reviewerResult = parseReviewerJson(reviewer.text);
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
    message: "Polishing wording and readability...",
  });

  const editor = await generateText({
    model: openai(model),
    ...(isReasoningModel ? {} : { temperature: 0.22 }),
    system: [
      "You are Editor Agent: an experienced editor rewriting markdown based on reviewer instructions.",
      "Produce polished markdown only.",
      "Preserve meaning, factual claims, and markdown structure.",
      "Make moderate, meaningful edits that improve clarity and flow.",
      "Keep headings, paragraph order, and list structure unchanged unless a change is essential.",
      "Sentence-level rewrites are allowed when they make the text clearer.",
      "Avoid unnecessary stylistic rewrites.",
      "Do not add explanations, code fences, or comments.",
    ].join(" "),
    prompt: [
      "Reviewer summary:",
      reviewerResult.review,
      "",
      "Key improvements:",
      ...reviewerResult.keyImprovements.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      "Rewrite plan:",
      ...reviewerResult.rewritePlan.map((item, idx) => `${idx + 1}. ${item}`),
      "",
      "Original markdown:",
      markdown,
    ].join("\n"),
    providerOptions: {
      openai: {
          reasoningEffort: 'low',
          textVerbosity: 'low'
        }
    }
  });

  const before = normalizeMarkdownForCompare(markdown);
  let polishedMarkdown = editor.text.trim();
  let changed = normalizeMarkdownForCompare(polishedMarkdown) !== before;

  if (!polishedMarkdown) {
    polishedMarkdown = markdown;
    changed = false;
  } else if (isOverEdited(markdown, polishedMarkdown)) {
    onStage?.({
      agent: "editor",
      status: "started",
      message: "Tuning the draft for a lighter touch...",
    });
    const conservativeRetry = await generateText({
      model: openai(model),
      ...(isReasoningModel ? {} : { temperature: 0.14 }),
      system: [
        "You are Editor Agent.",
        "Apply a balanced polish with restrained rewrites.",
        "Keep structure and ordering intact.",
        "Improve clarity and rhythm, but avoid full paraphrasing.",
        "Output only markdown without explanations.",
      ].join(" "),
      prompt: [
        "Original markdown:",
        markdown,
        "",
        "Over-edited draft (for reference, do not copy large rewrites):",
        polishedMarkdown,
        "",
        "Now produce a lightly polished version of the original with minimal edits.",
      ].join("\n"),
      providerOptions: {
      openai: {
          reasoningEffort: 'low',
          textVerbosity: 'low'
        }
    }
    });

    const retried = conservativeRetry.text.trim();
    if (retried && !isOverEdited(markdown, retried)) {
      polishedMarkdown = retried;
    } else if (retried) {
      const firstScore = wordJaccardSimilarity(markdown, polishedMarkdown);
      const retryScore = wordJaccardSimilarity(markdown, retried);
      polishedMarkdown = retryScore >= firstScore ? retried : polishedMarkdown;
    } else if (isOverEdited(markdown, polishedMarkdown)) {
      polishedMarkdown = markdown;
    }
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
