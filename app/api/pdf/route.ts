import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toSafePdfFileName(input: unknown) {
  const raw =
    typeof input === "string" && input.trim().length > 0
      ? input.trim()
      : "md-to-pdf";

  const cleaned = raw.replace(/[^\w.\- ]+/g, "").slice(0, 80).trim();
  const withExt = cleaned.toLowerCase().endsWith(".pdf")
    ? cleaned
    : `${cleaned}.pdf`;

  return withExt.length > 0 ? withExt : "md-to-pdf.pdf";
}

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const markdown =
    typeof (body as { markdown?: unknown })?.markdown === "string"
      ? (body as { markdown: string }).markdown
      : "";

  if (!markdown.trim()) {
    return NextResponse.json(
      { error: "Missing `markdown`." },
      { status: 400 },
    );
  }

  if (markdown.length > 1_000_000) {
    return NextResponse.json(
      { error: "`markdown` is too large (max 1,000,000 chars)." },
      { status: 413 },
    );
  }

  const fileName = toSafePdfFileName(
    (body as { fileName?: unknown })?.fileName,
  );
  const disposition =
    (body as { disposition?: unknown })?.disposition === "attachment"
      ? "attachment"
      : "inline";

  try {
    const { mdToPdf } = await import("md-to-pdf");
    const puppeteerModule = await import("puppeteer");
    const puppeteer =
      (puppeteerModule as unknown as { default?: { executablePath: () => string } })
        .default ?? (puppeteerModule as unknown as { executablePath: () => string });

    const launchOptions: Record<string, unknown> = {
      executablePath: puppeteer.executablePath(),
    };


    const pdf = await mdToPdf(
      { content: markdown },
      {
        pdf_options: {
          format: "A4",
          printBackground: true,
        },
        stylesheet: [
          "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/2.10.0/github-markdown.min.css",
        ]
      }
    );

    if (!pdf?.content) {
      return NextResponse.json(
        { error: "PDF generation returned empty content." },
        { status: 500 },
      );
    }

    const bytes = Uint8Array.from(pdf.content);
    const blob = new Blob([bytes], { type: "application/pdf" });

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    // Helpful for local debugging; avoid leaking stack traces to clients by default.
    console.error("[api/pdf] PDF generation failed:", error);
    return NextResponse.json(
      {
        error: "PDF generation failed.",
        message,
        ...(process.env.NODE_ENV !== "production" && error instanceof Error
          ? { stack: error.stack }
          : {}),
      },
      { status: 500 },
    );
  }
}
