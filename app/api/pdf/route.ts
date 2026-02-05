import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { markdown, fileName, disposition } = await req.json().catch(() => ({}));

    if (!markdown || typeof markdown !== "string" || !markdown.trim()) {
      return NextResponse.json({ error: "Missing or empty markdown." }, { status: 400 });
    }

    if (markdown.length > 10_000_000) {
      return NextResponse.json({ error: "Markdown too large (max 10MB)." }, { status: 413 });
    }

    // Normalize file name.
    const safeName = String(fileName || "md-to-pdf").replace(/[^\w.-]/g, "").slice(0, 80) || "md-to-pdf";
    const finalName = safeName.toLowerCase().endsWith(".pdf") ? safeName : `${safeName}.pdf`;
    const contentDisposition = disposition === "attachment" ? "attachment" : "inline";

    // Dynamic import to optimize cold start.
    const { mdToPdf } = await import("md-to-pdf");

    const pdf = await mdToPdf(
      { content: markdown },
      {
        pdf_options: { format: "A4", printBackground: true },
        stylesheet: ["https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/2.10.0/github-markdown.min.css"],
      }
    );

    if (!pdf?.content) throw new Error("PDF generation returned empty content.");

    return new NextResponse(pdf.content, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${contentDisposition}; filename="${finalName}"`,
        "Cache-Control": "no-store",
      },
    });

  } catch (error) {
    console.error("[api/pdf] Error:", error);
    return NextResponse.json({ error: "PDF generation failed." }, { status: 500 });
  }
}