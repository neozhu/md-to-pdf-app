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

    // Use marked to convert markdown to HTML, then puppeteer for PDF
    // This avoids md-to-pdf's highlight.js path resolution issues
    const { marked } = await import("marked");
    const hljs = await import("highlight.js");
    
    // Configure marked to use highlight.js for syntax highlighting
    marked.setOptions({
      highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {
            console.error('Highlight error:', e);
          }
        }
        return hljs.highlightAuto(code).value;
      }
    });
    
    const htmlContent = await marked(markdown);
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 1.5cm 1cm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
            }
            .markdown-body {
              box-sizing: border-box;
              width: 100%;
              padding: 0.5cm;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "Microsoft YaHei", sans-serif;
              font-size: 14px;
            }
            .markdown-body * {
              font-family: inherit;
            }
            .markdown-body code,
            .markdown-body pre {
              font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace, "Noto Sans SC";
            }
            .markdown-body h1,
            .markdown-body h2,
            .markdown-body h3,
            .markdown-body h4,
            .markdown-body h5,
            .markdown-body h6 {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Serif SC", "Microsoft YaHei", sans-serif;
              page-break-after: avoid;
            }
            .markdown-body pre {
              page-break-inside: avoid;
            }
            .markdown-body table {
              page-break-inside: avoid;
            }
            .markdown-body table th,
            .markdown-body table td {
              border-color: #d0d7de !important;
            }
            .markdown-body table tr {
              border-top-color: #d0d7de !important;
            }
          </style>
        </head>
        <body>
          <div class="markdown-body">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;

    // Convert HTML to PDF using puppeteer directly
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
      
      // Wait a bit more for fonts to load and render
      await page.evaluateHandle('document.fonts.ready');
      
      const pdfBuffer = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {
          top: '1.5cm',
          right: '1cm',
          bottom: '1.5cm',
          left: '1cm'
        }
      });
      await browser.close();

      return new NextResponse(pdfBuffer, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `${contentDisposition}; filename="${finalName}"`,
          "Cache-Control": "no-store",
        },
      });
    } catch (puppeteerError) {
      await browser.close();
      throw puppeteerError;
    }

  } catch (error) {
    console.error("[api/pdf] Error:", error);
    return NextResponse.json({ error: "PDF generation failed." }, { status: 500 });
  }
}