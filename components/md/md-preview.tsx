"use client";

import * as React from "react";

import { renderSafeMarkdownToHtml } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";

export function MdPreview({
  markdown,
  className,
}: {
  markdown: string;
  className?: string;
}) {
  const safeHtml = React.useMemo(
    () => renderSafeMarkdownToHtml(markdown),
    [markdown],
  );

  return (
    <div className={cn("h-full overflow-auto p-5", className)}>
      <div
        className="md-preview-rendered"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
      <style jsx>{`
        .md-preview-rendered :global(h1) {
          margin-bottom: 1rem;
          font-size: 1.5rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        .md-preview-rendered :global(h2) {
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }

        .md-preview-rendered :global(h3) {
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          font-size: 1.125rem;
          font-weight: 600;
        }

        .md-preview-rendered :global(p) {
          margin-top: 0.75rem;
          margin-bottom: 0.75rem;
          line-height: 1.75;
          color: color-mix(in oklch, currentColor 90%, transparent);
        }

        .md-preview-rendered :global(a) {
          font-weight: 500;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .md-preview-rendered :global(a:hover) {
          color: color-mix(in oklch, currentColor 82%, transparent);
        }

        .md-preview-rendered :global(ul) {
          margin: 0.75rem 0 0.75rem 1.25rem;
          list-style: disc;
        }

        .md-preview-rendered :global(ol) {
          margin: 0.75rem 0 0.75rem 1.25rem;
          list-style: decimal;
        }

        .md-preview-rendered :global(li) {
          margin: 0.25rem 0;
        }

        .md-preview-rendered :global(hr) {
          margin: 1.5rem 0;
          border-color: var(--border);
        }

        .md-preview-rendered :global(blockquote) {
          margin: 1rem 0;
          border-left: 2px solid var(--border);
          padding-left: 1rem;
          color: var(--muted-foreground);
        }

        .md-preview-rendered :global(table) {
          margin: 1rem 0;
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
        }

        .md-preview-rendered :global(th) {
          border: 1px solid var(--border);
          background: var(--muted);
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-weight: 500;
        }

        .md-preview-rendered :global(td) {
          border: 1px solid var(--border);
          padding: 0.5rem 0.75rem;
        }

        .md-preview-rendered :global(pre) {
          margin: 1rem 0;
          overflow-x: auto;
          border-radius: 0.5rem;
          border: 1px solid
            color-mix(in oklch, var(--border) 100%, transparent);
          background: transparent;
          font-size: 0.75rem;
          line-height: 1.6;
          padding: 0.75rem;
        }

        .md-preview-rendered :global(pre code) {
          background: transparent;
          border: 0;
          padding: 0;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .md-preview-rendered :global(:not(pre) > code) {
          border-radius: 0.25rem;
          border: 1px solid
            color-mix(in oklch, var(--border) 100%, transparent);
          background: color-mix(in oklch, var(--muted) 100%, transparent);
          padding: 0.125rem 0.375rem;
          font-size: 0.75rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
        }

        .md-preview-rendered :global(img) {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}

