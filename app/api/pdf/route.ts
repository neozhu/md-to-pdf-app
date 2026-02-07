import { NextResponse } from "next/server";
import sanitizeHtml from "sanitize-html";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";

export const runtime = "nodejs";

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "ul",
    "ol",
    "li",
    "blockquote",
    "code",
    "pre",
    "em",
    "strong",
    "del",
    "hr",
    "br",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "img",
    "span",
    "input",
  ],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    code: ["class"],
    span: ["class"],
    th: ["align", "colspan", "rowspan"],
    td: ["align", "colspan", "rowspan"],
    input: ["type", "checked", "disabled"],
  },
  allowedClasses: {
    code: [/^language-[a-z0-9-]+$/i, /^hljs(?:-[a-z0-9-]+)?$/i],
    span: [/^hljs(?:-[a-z0-9-]+)?$/i],
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: {
    img: ["http", "https", "data"],
  },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
};

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

    // Use marked + marked-highlight to render HTML with syntax highlighting in one pass.
    const hljs = (await import("highlight.js")).default;

    const parser = new Marked(
      markedHighlight({
        langPrefix: "hljs language-",
        emptyLangClass: "hljs",
        highlight(code, lang) {
          try {
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
          } catch (e) {
            console.error("[api/pdf] Highlight error:", e);
            return code;
          }
        },
      }),
    );
    parser.setOptions({
      gfm: true,
      breaks: true,
    });

    const renderedHtml = await parser.parse(markdown);

    // IMPORTANT: marked output is not sanitized by default.
    const sanitizedHtml = sanitizeHtml(renderedHtml, SANITIZE_OPTIONS);

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
            ${sanitizedHtml}
          </div>
        </body>
      </html>
    `;

    // Convert HTML to PDF using puppeteer directly
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-default-browser-check',
        '--disable-crash-reporter',
        '--disable-breakpad'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
        displayHeaderFooter: false,
        margin: {
          top: '1.5cm',
          right: '1cm',
          bottom: '1.5cm',
          left: '1cm'
        }
      });
      await browser.close();

      return new NextResponse(Buffer.from(pdfBuffer), {
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
