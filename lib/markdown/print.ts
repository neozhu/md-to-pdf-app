import { renderSafeMarkdownToHtml } from "./render";

const GITHUB_MARKDOWN_CSS_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.8.1/github-markdown.min.css";
const HIGHLIGHT_CSS_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css";

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildPrintableHtml(contentHtml: string, title: string) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${GITHUB_MARKDOWN_CSS_URL}" />
    <link rel="stylesheet" href="${HIGHLIGHT_CSS_URL}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@400;700&display=swap"
    />
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

      .markdown-body h1,
      .markdown-body h2 {
        border-bottom: none !important;
        padding-bottom: 0 !important;
      }

      .markdown-body hr {
        height: 0;
        border: 0;
        border-top: 1px solid #e4e4e7;
        margin: 1.5rem 0;
      }

      .markdown-body pre,
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
    <div class="markdown-body">${contentHtml}</div>
  </body>
</html>`;
}

export async function printMarkdownLocally(markdown: string, title: string) {
  const safeHtml = renderSafeMarkdownToHtml(markdown);
  const docHtml = buildPrintableHtml(safeHtml, title);

  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    iframe.srcdoc = "about:blank";

    let watchdogTimer: number | null = null;
    let fallbackTimer: number | null = null;
    const cleanup = () => {
      if (watchdogTimer !== null) {
        window.clearTimeout(watchdogTimer);
      }
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      iframe.remove();
    };

    let done = false;
    const finish = (err?: unknown) => {
      if (done) return;
      done = true;
      cleanup();
      if (err) {
        reject(err instanceof Error ? err : new Error("Print failed."));
      } else {
        resolve();
      }
    };

    watchdogTimer = window.setTimeout(() => {
      finish(new Error("Print timed out. Please try again."));
    }, 10000);

    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc) {
      finish(new Error("Unable to access print document."));
      return;
    }

    iframeDoc.open();
    iframeDoc.write(docHtml);
    iframeDoc.close();

    const triggerPrint = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        finish(new Error("Unable to access print window."));
        return;
      }

      printWindow.addEventListener("afterprint", () => finish(), {
        once: true,
      });

      try {
        printWindow.focus();
        printWindow.print();
        // Fallback for environments where afterprint is unreliable.
        fallbackTimer = window.setTimeout(() => finish(), 1200);
      } catch (error) {
        finish(error);
      }
    };

    window.setTimeout(triggerPrint, 80);
  });
}
