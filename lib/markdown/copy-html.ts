import { renderSafeMarkdownToHtml } from "./render";

/**
 * Inline-style map for common HTML elements.
 * OneNote strips class-based and <style> CSS, so styles must be inlined.
 */
const INLINE_STYLES: Record<string, string> = {
  h1: "margin: 0 0 16px 0; font-size: 24px; font-weight: 700; line-height: 1.3; color: #1a1a1a; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  h2: "margin: 24px 0 12px 0; font-size: 20px; font-weight: 700; line-height: 1.3; color: #1a1a1a; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  h3: "margin: 20px 0 8px 0; font-size: 16px; font-weight: 700; line-height: 1.3; color: #1a1a1a; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  h4: "margin: 16px 0 6px 0; font-size: 14px; font-weight: 700; line-height: 1.3; color: #1a1a1a; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  h5: "margin: 12px 0 4px 0; font-size: 13px; font-weight: 700; line-height: 1.3; color: #1a1a1a; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  h6: "margin: 12px 0 4px 0; font-size: 12px; font-weight: 700; line-height: 1.3; color: #666; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  p: "margin: 8px 0; font-size: 14px; line-height: 1.7; color: #333; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  ul: "margin: 8px 0 8px 24px; padding: 0; font-size: 14px; line-height: 1.7; color: #333; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  ol: "margin: 8px 0 8px 24px; padding: 0; font-size: 14px; line-height: 1.7; color: #333; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  li: "margin: 3px 0; font-size: 14px; line-height: 1.7; color: #333; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  blockquote:
    "margin: 12px 0; padding: 8px 16px; border-left: 4px solid #ddd; color: #666; font-style: italic; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  pre: "margin: 12px 0; padding: 12px; background-color: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 6px; overflow-x: auto; font-size: 13px; line-height: 1.5;",
  code: "font-family: Consolas, 'Courier New', monospace; font-size: 13px;",
  "code-inline":
    "font-family: Consolas, 'Courier New', monospace; font-size: 12px; background-color: #f0f0f0; padding: 2px 6px; border-radius: 3px; border: 1px solid #e1e4e8;",
  table:
    "margin: 12px 0; border-collapse: collapse; width: 100%; font-size: 14px; font-family: Segoe UI, Calibri, Arial, sans-serif;",
  th: "border: 1px solid #d0d7de; padding: 8px 12px; text-align: left; font-weight: 600; background-color: #f6f8fa;",
  td: "border: 1px solid #d0d7de; padding: 8px 12px; text-align: left;",
  hr: "border: none; border-top: 1px solid #d0d7de; margin: 20px 0;",
  strong: "font-weight: 700;",
  em: "font-style: italic;",
  del: "text-decoration: line-through;",
  a: "color: #0969da; text-decoration: underline;",
  img: "max-width: 100%; height: auto;",
};

/**
 * Inject inline styles into HTML elements.
 * Replaces `<tag ...>` with `<tag style="..." ...>` for OneNote compatibility.
 */
function injectInlineStyles(html: string): string {
  let result = html;

  // Handle inline <code> (not inside <pre>) differently from code blocks.
  // First, protect <pre><code> blocks by marking them.
  result = result.replace(
    /<pre([^>]*)>\s*<code([^>]*)>/gi,
    '<pre$1>___PRE_CODE_START___<code$2>'
  );

  // Now style inline <code> tags (those not preceded by ___PRE_CODE_START___)
  result = result.replace(
    /(?<!___PRE_CODE_START___)<code([^>]*)>/gi,
    `<code$1 style="${INLINE_STYLES["code-inline"]}">`
  );

  // Restore <pre><code> blocks and style them normally
  result = result.replace(/___PRE_CODE_START___/g, "");

  // Apply inline styles to all other known tags
  for (const [tag, style] of Object.entries(INLINE_STYLES)) {
    if (tag === "code" || tag === "code-inline") continue;

    // Match opening tags, preserving existing attributes
    const tagRegex = new RegExp(`<${tag}(\\s[^>]*)?>`, "gi");
    result = result.replace(tagRegex, (match, attrs) => {
      // If a style attribute already exists, append to it
      if (attrs && /style\s*=/i.test(attrs)) {
        return match.replace(
          /style\s*=\s*"([^"]*)"/i,
          `style="${style} $1"`
        );
      }
      const existingAttrs = attrs || "";
      return `<${tag}${existingAttrs} style="${style}">`;
    });
  }

  return result;
}

/**
 * Render markdown to HTML with all styles inlined for OneNote clipboard paste.
 */
export function renderMarkdownForOneNote(markdown: string): string {
  const html = renderSafeMarkdownToHtml(markdown);
  const styledHtml = injectInlineStyles(html);

  // Wrap in a container div with base font settings
  return `<div style="font-family: Segoe UI, Calibri, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">${styledHtml}</div>`;
}

/**
 * Copy rich HTML (with inline styles) to the clipboard so it can be
 * pasted into OneNote, Word, and other rich-text targets as formatted text.
 *
 * Falls back to plain text copy if the Clipboard API is unavailable.
 */
export async function copyHtmlToClipboard(html: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof ClipboardItem !== "undefined"
  ) {
    const blob = new Blob([html], { type: "text/html" });
    const item = new ClipboardItem({ "text/html": blob });
    await navigator.clipboard.write([item]);
  } else {
    // Fallback: use a temporary contentEditable div and execCommand
    const container = document.createElement("div");
    container.innerHTML = html;
    container.style.position = "fixed";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.contentEditable = "true";
    document.body.appendChild(container);

    const range = document.createRange();
    range.selectNodeContents(container);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    document.execCommand("copy");

    selection?.removeAllRanges();
    document.body.removeChild(container);
  }
}
