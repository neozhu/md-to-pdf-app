import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const root = process.cwd();
const outputPath = path.join(root, "docs", "image.png");

const markdownLines = [
  "# Markdown to PDF Converter",
  "",
  "A focused workspace for turning Markdown into polished PDFs.",
  "",
  "## Features",
  "- Live editor and preview",
  "- AI review and filename suggestions",
  "- Supabase history with per-user documents",
  "- Export to clean, print-ready PDF",
  "",
  "```bash",
  "pnpm dev",
  "open http://localhost:3000",
  "```",
];

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        width: 1200px;
        height: 630px;
        overflow: hidden;
        background:
          linear-gradient(135deg, #f8fafc 0%, #eef2ff 45%, #f8fafc 100%);
        color: #111827;
      }

      .frame {
        position: relative;
        width: 1200px;
        height: 630px;
        padding: 34px;
      }

      .glow {
        position: absolute;
        inset: auto 56px 24px auto;
        width: 380px;
        height: 220px;
        background: rgba(37, 99, 235, 0.16);
        filter: blur(58px);
        border-radius: 999px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 22px;
      }

      .logo {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: #111827;
        color: white;
        font-weight: 800;
        letter-spacing: 0;
      }

      .brand strong {
        display: block;
        font-size: 18px;
        line-height: 1;
      }

      .brand span {
        display: block;
        margin-top: 4px;
        font-size: 12px;
        color: #64748b;
      }

      .hero {
        position: relative;
        display: grid;
        grid-template-columns: 380px 1fr;
        gap: 26px;
        align-items: stretch;
        height: 520px;
      }

      .copy {
        padding: 24px 4px 0 0;
      }

      h1 {
        margin: 0;
        font-size: 58px;
        line-height: 1.02;
        letter-spacing: 0;
        max-width: 360px;
      }

      .lead {
        margin: 20px 0 26px;
        font-size: 20px;
        line-height: 1.45;
        color: #334155;
      }

      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .pill {
        border: 1px solid #dbe3ef;
        background: rgba(255, 255, 255, 0.72);
        border-radius: 999px;
        padding: 9px 13px;
        color: #1f2937;
        font-size: 13px;
        font-weight: 650;
      }

      .app {
        position: relative;
        border: 1px solid rgba(148, 163, 184, 0.34);
        border-radius: 18px;
        overflow: hidden;
        background: white;
        box-shadow:
          0 24px 60px rgba(15, 23, 42, 0.14),
          0 4px 14px rgba(15, 23, 42, 0.08);
      }

      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        height: 46px;
        padding: 0 14px;
        border-bottom: 1px solid #e5e7eb;
        background: #ffffff;
      }

      .actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      .input,
      .button {
        height: 28px;
        border: 1px solid #e5e7eb;
        border-radius: 7px;
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        padding: 0 11px;
        display: flex;
        align-items: center;
      }

      .button.dark {
        background: #111827;
        color: white;
        border-color: #111827;
      }

      .workspace {
        display: grid;
        grid-template-columns: 150px 1fr 1fr;
        height: 472px;
      }

      .sidebar {
        border-right: 1px solid #e5e7eb;
        background: #fafafa;
        padding: 13px 10px;
      }

      .new {
        display: inline-flex;
        height: 26px;
        align-items: center;
        gap: 6px;
        border-radius: 7px;
        background: #111827;
        color: white;
        padding: 0 10px;
        font-size: 12px;
        font-weight: 700;
      }

      .search {
        margin: 13px 0 15px;
        height: 30px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: white;
        color: #94a3b8;
        font-size: 12px;
        padding: 7px 9px;
      }

      .doc {
        border: 1px solid #e5e7eb;
        border-radius: 9px;
        background: white;
        padding: 10px;
        margin-bottom: 8px;
      }

      .doc.active {
        border-color: #93c5fd;
        box-shadow: 0 0 0 2px #dbeafe;
      }

      .doc strong {
        display: block;
        font-size: 12px;
        margin-bottom: 4px;
      }

      .doc span {
        display: block;
        color: #64748b;
        font-size: 10px;
        line-height: 1.35;
      }

      .pane {
        min-width: 0;
        border-right: 1px solid #e5e7eb;
        background: white;
      }

      .pane:last-child {
        border-right: 0;
      }

      .pane-title {
        height: 30px;
        display: flex;
        align-items: center;
        padding: 0 12px;
        border-bottom: 1px solid #e5e7eb;
        font-size: 12px;
        font-weight: 800;
      }

      .editor {
        padding: 11px 13px;
        font-family: "SF Mono", Consolas, ui-monospace, monospace;
        font-size: 11px;
        line-height: 1.75;
        color: #475569;
      }

      .line {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 8px;
        white-space: pre;
      }

      .ln {
        color: #38bdf8;
        text-align: right;
      }

      .md-blue {
        color: #0284c7;
        font-weight: 800;
      }

      .md-red {
        color: #be123c;
      }

      .preview {
        padding: 20px 22px;
      }

      .preview h2 {
        margin: 0 0 14px;
        font-size: 28px;
        letter-spacing: 0;
      }

      .preview p {
        color: #334155;
        font-size: 13px;
        line-height: 1.7;
        margin: 0 0 18px;
      }

      .preview h3 {
        margin: 22px 0 10px;
        font-size: 20px;
      }

      .preview ul {
        margin: 0;
        padding-left: 18px;
        font-size: 12px;
        line-height: 1.8;
      }

      .code {
        margin-top: 20px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        background: #f8fafc;
        padding: 16px;
        font-family: "SF Mono", Consolas, ui-monospace, monospace;
        font-size: 12px;
        color: #334155;
      }
    </style>
  </head>
  <body>
    <div class="frame">
      <div class="glow"></div>
      <div class="brand">
        <div class="logo">↯</div>
        <div>
          <strong>MD → PDF</strong>
          <span>Markdown editor, AI review, PDF export</span>
        </div>
      </div>

      <div class="hero">
        <section class="copy">
          <h1>Turn Markdown into polished PDFs</h1>
          <p class="lead">A focused Next.js workspace with live preview, AI review, document history, and clean PDF export.</p>
          <div class="pills">
            <span class="pill">Next.js 16</span>
            <span class="pill">Supabase history</span>
            <span class="pill">AI review</span>
            <span class="pill">Puppeteer PDF</span>
          </div>
        </section>

        <section class="app" aria-label="MD to PDF app preview">
          <div class="topbar">
            <div class="input">project-export.pdf</div>
            <div class="actions">
              <div class="button dark">Download PDF</div>
              <div class="button">Print</div>
            </div>
          </div>
          <div class="workspace">
            <aside class="sidebar">
              <div class="new">+ New</div>
              <div class="search">Search docs...</div>
              <div class="doc active"><strong>project-export.md</strong><span>AI polished architecture notes...</span></div>
              <div class="doc"><strong>meeting-notes.md</strong><span>Decide on export details...</span></div>
              <div class="doc"><strong>template.md</strong><span>Reusable document outline...</span></div>
            </aside>
            <div class="pane">
              <div class="pane-title">Editor</div>
              <div class="editor">
                ${markdownLines.map((line, index) => {
                  const safe = line
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;");
                  const decorated = safe
                    .replace(/^# .+$/, '<span class="md-blue">$&</span>')
                    .replace(/^## .+$/, '<span class="md-blue">$&</span>')
                    .replace(/^- .+$/, '<span class="md-red">$&</span>');
                  return `<div class="line"><span class="ln">${index + 1}</span><span>${decorated || " "}</span></div>`;
                }).join("")}
              </div>
            </div>
            <div class="pane">
              <div class="pane-title">Preview</div>
              <div class="preview">
                <h2>Markdown to PDF Converter</h2>
                <p>A focused workspace for turning Markdown into polished, shareable PDF documents.</p>
                <h3>Features</h3>
                <ul>
                  <li><strong>Live Preview</strong> with clean Markdown rendering</li>
                  <li><strong>AI Review</strong> for structure and polish</li>
                  <li><strong>History</strong> synced with Supabase</li>
                  <li><strong>PDF Export</strong> powered by Puppeteer</li>
                </ul>
                <div class="code">pnpm dev<br/>open http://localhost:3000</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </body>
</html>`;

await fs.mkdir(path.dirname(outputPath), { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle0" });
  await page.screenshot({ path: outputPath, type: "png" });
  console.log(`Generated ${path.relative(root, outputPath)}`);
} finally {
  await browser.close();
}
