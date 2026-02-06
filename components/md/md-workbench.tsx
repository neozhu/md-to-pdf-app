"use client";

import * as React from "react";
import { Download, History, Loader2, Printer } from "lucide-react";
import { marked } from "marked";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createMdHistoryDoc,
  deleteMdHistoryDoc,
  listMdHistoryDocs,
  upsertMdHistoryDoc,
} from "@/lib/md-history-api";
import { HistoryCloseButton, MdHistory } from "./md-history";
import { MdEditor } from "./md-editor";
import { MdPreview } from "./md-preview";
import {
  mdFileNameToPdfFileName,
  useMdHistory,
} from "./use-md-history";

type ViewMode = "split" | "editor" | "preview";

export function MdWorkbench() {
  const emptyDocs = React.useMemo(() => [], []);
  const history = useMdHistory(emptyDocs);
  const didUserEditRef = React.useRef(false);
  const hydrateRef = React.useRef(history.hydrate);
  hydrateRef.current = history.hydrate;

  const [isHistoryHydrating, setIsHistoryHydrating] = React.useState(true);
  const [hasLoadedFromDb, setHasLoadedFromDb] = React.useState(false);

  const [markdownText, setMarkdownText] = React.useState(
    () => history.activeDoc.markdown,
  );
  const onEditorChange = React.useCallback((value: string) => {
    didUserEditRef.current = true;
    setMarkdownText(value);
  }, []);
  const [viewMode, setViewMode] = React.useState<ViewMode>("split");

  // Auto-save after user stops typing
  React.useEffect(() => {
    if (!didUserEditRef.current) return;
    
    const currentDoc = history.docs.find((d) => d.id === history.activeDocId);
    if (!currentDoc || currentDoc.markdown === markdownText) return;

    // Don't auto-save empty documents
    if (markdownText.trim() === "") return;

    const timeoutId = setTimeout(async () => {
      const nowMs = Date.now();
      const updatedDoc = {
        ...currentDoc,
        markdown: markdownText,
        updatedAt: nowMs,
      };

      // Update local state immediately for responsive UI
      history.updateDoc(updatedDoc);

      // Save to database
      try {
        await upsertMdHistoryDoc(updatedDoc);
        // Show subtle success toast
        toast.success("Saved", {
          duration: 1000,
          position: "bottom-right",
        });
      } catch (e) {
        // Revert local state on error
        toast.error(e instanceof Error ? e.message : "Auto-save failed.");
      }
    }, 1500); // Auto-save after 1.5 seconds of inactivity

    return () => clearTimeout(timeoutId);
  }, [markdownText, history]);
  const [fileName, setFileName] = React.useState(() =>
    mdFileNameToPdfFileName(history.activeDoc.mdFileName),
  );
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false);

  const canSplit = useIsLgUp();

  React.useEffect(() => {
    setViewMode((current) => {
      if (canSplit) {
        return current === "editor" || current === "preview" ? "split" : current;
      }
      return current === "split" ? "editor" : current;
    });
  }, [canSplit]);

  React.useEffect(() => {
    setFileName(mdFileNameToPdfFileName(history.activeDoc.mdFileName));
  }, [history.activeDocId, history.activeDoc.mdFileName]);

  // Auto-save when fileName changes
  React.useEffect(() => {
    if (!didUserEditRef.current) return;

    const currentDoc = history.docs.find((d) => d.id === history.activeDocId);
    if (!currentDoc) return;

    // Convert PDF filename back to MD filename
    let mdFileName = fileName;
    if (mdFileName.toLowerCase().endsWith('.pdf')) {
      mdFileName = mdFileName.slice(0, -4) + '.md';
    } else if (!mdFileName.toLowerCase().endsWith('.md')) {
      mdFileName = mdFileName + '.md';
    }

    // Check if mdFileName actually changed
    if (currentDoc.mdFileName === mdFileName) return;

    const timeoutId = setTimeout(async () => {
      const nowMs = Date.now();
      const updatedDoc = {
        ...currentDoc,
        mdFileName,
        updatedAt: nowMs,
      };

      // Update local state immediately
      history.updateDoc(updatedDoc);

      // Save to database
      try {
        await upsertMdHistoryDoc(updatedDoc);
        toast.success("Filename saved", {
          duration: 1000,
          position: "bottom-right",
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save filename.");
      }
    }, 800); // Save after 800ms of inactivity

    return () => clearTimeout(timeoutId);
  }, [fileName, history]);

  React.useEffect(() => {
    if (canSplit) setIsHistoryOpen(false);
  }, [canSplit]);

  React.useEffect(() => {
    const controller = new AbortController();
    setIsHistoryHydrating(true);

    listMdHistoryDocs(controller.signal)
      .then((docs) => {
        if (didUserEditRef.current) return;
        
        // Filter out empty documents (like initial doc-initial)
        const nonEmptyDocs = docs.filter(doc => doc.markdown.trim() !== "");
        
        const nextActive = hydrateRef.current(nonEmptyDocs);
        if (!didUserEditRef.current && nextActive) {
          setMarkdownText(nextActive.markdown);
        }
        setHasLoadedFromDb(true);
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        toast.error(e instanceof Error ? e.message : "Failed to load history.");
        setHasLoadedFromDb(true);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsHistoryHydrating(false);
      });

    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    if (!isHistoryOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsHistoryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isHistoryOpen]);

  async function requestPdf(disposition: "inline" | "attachment") {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: markdownText,
        fileName,
        disposition,
      }),
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string; message?: string };
        message = data.message ?? data.error ?? message;
      } catch {
        // ignore
      }
      throw new Error(message);
    }

    const buf = await res.arrayBuffer();
    return new Blob([buf], { type: "application/pdf" });
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function printBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          URL.revokeObjectURL(url);
          iframe.remove();
        }, 500);
      }
    };

    document.body.appendChild(iframe);
  }

  async function onDownload() {
    
    setError(null);
    setIsExporting(true);
    try {
      const blob = await requestPdf("attachment");
      downloadBlob(blob);
      // Show success toast after download starts
      toast.success("PDF downloaded!", {
        duration: 2500,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setIsExporting(false);
    }
  }

  async function onPrint() {
    setError(null);
    setIsExporting(true);
    try {
      // Create a hidden iframe for printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        throw new Error("Cannot access iframe document");
      }

      // Write print-ready HTML with inline styles (no CDN dependencies)
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${fileName}</title>
            <style>
              @page {
                size: A4;
                margin: 1.5cm 1cm;
              }
              @media print {
                @page {
                  margin: 1.5cm 1cm;
                }
                html, body {
                  margin: 0;
                  padding: 0;
                }
              }
              * {
                box-sizing: border-box;
              }
              body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "Noto Sans SC", sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: #24292f;
                background: #ffffff;
              }
              .markdown-body {
                width: 100%;
                max-width: 100%;
                padding: 0.5cm;
              }
              .markdown-body h1,
              .markdown-body h2,
              .markdown-body h3,
              .markdown-body h4,
              .markdown-body h5,
              .markdown-body h6 {
                margin-top: 24px;
                margin-bottom: 16px;
                font-weight: 600;
                line-height: 1.25;
                page-break-after: avoid;
              }
              .markdown-body h1 {
                font-size: 2em;
                border-bottom: 1px solid #d8dee4;
                padding-bottom: 0.3em;
              }
              .markdown-body h2 {
                font-size: 1.5em;
                border-bottom: 1px solid #d8dee4;
                padding-bottom: 0.3em;
              }
              .markdown-body h3 { font-size: 1.25em; }
              .markdown-body h4 { font-size: 1em; }
              .markdown-body h5 { font-size: 0.875em; }
              .markdown-body h6 { font-size: 0.85em; color: #57606a; }
              .markdown-body p {
                margin-top: 0;
                margin-bottom: 16px;
              }
              .markdown-body a {
                color: #0969da;
                text-decoration: none;
              }
              .markdown-body a:hover {
                text-decoration: underline;
              }
              .markdown-body ul,
              .markdown-body ol {
                margin-top: 0;
                margin-bottom: 16px;
                padding-left: 2em;
              }
              .markdown-body li {
                margin-top: 0.25em;
              }
              .markdown-body li + li {
                margin-top: 0.25em;
              }
              .markdown-body code {
                padding: 0.2em 0.4em;
                margin: 0;
                font-size: 85%;
                background-color: rgba(175,184,193,0.2);
                border-radius: 6px;
                font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
              }
              .markdown-body pre {
                padding: 16px;
                overflow: auto;
                font-size: 85%;
                line-height: 1.45;
                background-color: #f6f8fa;
                border-radius: 6px;
                margin-top: 0;
                margin-bottom: 16px;
                page-break-inside: avoid;
              }
              .markdown-body pre code {
                display: block;
                padding: 0;
                margin: 0;
                background: transparent;
                border: 0;
                font-size: 100%;
                word-break: normal;
                white-space: pre;
                overflow-x: auto;
              }
              .markdown-body blockquote {
                padding: 0 1em;
                color: #57606a;
                border-left: 0.25em solid #d0d7de;
                margin: 0 0 16px 0;
              }
              .markdown-body table {
                border-spacing: 0;
                border-collapse: collapse;
                display: block;
                width: max-content;
                max-width: 100%;
                overflow: auto;
                margin-top: 0;
                margin-bottom: 16px;
                page-break-inside: avoid;
              }
              .markdown-body table th,
              .markdown-body table td {
                padding: 6px 13px;
                border: 1px solid #d0d7de;
              }
              .markdown-body table th {
                font-weight: 600;
                background-color: #f6f8fa;
              }
              .markdown-body table tr {
                background-color: #ffffff;
                border-top: 1px solid #d0d7de;
              }
              .markdown-body table tr:nth-child(2n) {
                background-color: #f6f8fa;
              }
              .markdown-body hr {
                height: 0.25em;
                padding: 0;
                margin: 24px 0;
                background-color: #d0d7de;
                border: 0;
              }
              .markdown-body img {
                max-width: 100%;
                box-sizing: content-box;
              }
              @media print {
                .markdown-body {
                  font-size: 12pt;
                }
                .markdown-body h1 { font-size: 24pt; }
                .markdown-body h2 { font-size: 18pt; }
                .markdown-body h3 { font-size: 14pt; }
                .markdown-body h4 { font-size: 12pt; }
                .markdown-body table {
                  border-collapse: collapse !important;
                }
                .markdown-body table th,
                .markdown-body table td {
                  border: 1px solid #d0d7de !important;
                }
              }
            </style>
          </head>
          <body>
            <div class="markdown-body" id="content"></div>
          </body>
        </html>
      `);
      iframeDoc.close();

      // Convert markdown to HTML using marked
      const contentDiv = iframeDoc.getElementById("content");
      if (contentDiv) {
        const html = await marked.parse(markdownText, {
          gfm: true,
          breaks: true,
        });
        contentDiv.innerHTML = html;
      }

      // Wait a moment for content to be fully rendered, then print
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            iframe.remove();
          }, 500);
        }
      }, 300);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setIsExporting(false);
    }
  }

  async function onNewDoc() {
    didUserEditRef.current = true;
    const result = history.createNew(markdownText);
    setMarkdownText(result.doc.markdown);
    setIsHistoryOpen(false);

    try {
      // Don't save empty initial docs
      if (result.savedActiveDoc && result.savedActiveDoc.markdown.trim() !== "") {
        await upsertMdHistoryDoc(result.savedActiveDoc);
      }
      await createMdHistoryDoc(result.doc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save history.");
    }
  }

  async function onSelectDoc(id: string) {
    // If selecting the same document, just close the sidebar
    if (id === history.activeDocId) {
      setIsHistoryOpen(false);
      return;
    }

    didUserEditRef.current = true;
    const result = history.switchTo(id, markdownText);
    if (!result) return;
    setMarkdownText(result.doc.markdown);
    setIsHistoryOpen(false);

    try {
      // Don't save empty initial docs
      if (result.savedActiveDoc && result.savedActiveDoc.markdown.trim() !== "") {
        await upsertMdHistoryDoc(result.savedActiveDoc);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save history.");
    }
  }

  async function onDeleteDoc(id: string) {
    didUserEditRef.current = true;
    const result = history.remove(id);
    if (result.nextActiveDoc) setMarkdownText(result.nextActiveDoc.markdown);

    try {
      await deleteMdHistoryDoc(id);
      if (result.createdDoc) {
        await createMdHistoryDoc(result.createdDoc);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete history.");
    }
  }

  // Filter out empty initial docs from display
  const displayDocs = hasLoadedFromDb ? history.docs : history.docs.filter(doc => doc.markdown.trim() !== "");
  const displayFilteredDocs = hasLoadedFromDb ? history.filteredDocs : history.filteredDocs.filter(doc => doc.markdown.trim() !== "");

  return (
    <div className="min-h-dvh">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(var(--tech-glow-1)/0.14),transparent_55%),radial-gradient(circle_at_80%_0%,oklch(var(--tech-glow-2)/0.12),transparent_45%)]" />

      <div className="relative mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-4 px-4 py-6 md:px-6">
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl border bg-primary shadow-sm overflow-hidden">
              <svg width="40" height="40" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="64" height="64" fill="#2563eb"/>
                <path d="M16 20C16 18.8954 16.8954 18 18 18H46C47.1046 18 48 18.8954 48 20V44C48 45.1046 47.1046 46 46 46H18C16.8954 46 16 45.1046 16 44V20Z" fill="white"/>
                <path d="M22 26L22 38L26 38L26 32L28 35L30 32L30 38L34 38L34 26L30 26L28 30.5L26 26L22 26Z" fill="#2563eb"/>
                <path d="M36 26L36 38L40 38L42 35L42 38L46 38L46 26L42 26L40 29L40 26L36 26Z" fill="#2563eb" fillOpacity="0.7"/>
              </svg>
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">
                MD → PDF
              </div>
              <div className="text-sm text-muted-foreground">
                Write, preview & export to PDF
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="w-[220px]"
              placeholder="md-to-pdf.pdf"
              aria-label="PDF file name"
            />

            {!canSplit && (
              <div className="flex items-center rounded-lg border bg-card p-1">
                <Button
                  size="sm"
                  variant={viewMode === "editor" ? "secondary" : "ghost"}
                  className="rounded-md"
                  onClick={() => setViewMode("editor")}
                >
                  Editor
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "preview" ? "secondary" : "ghost"}
                  className="rounded-md"
                  onClick={() => setViewMode("preview")}
                >
                  Preview
                </Button>
              </div>
            )}

            {!canSplit && (
              <Button
                variant="outline"
                disabled={isExporting}
                onClick={() => setIsHistoryOpen(true)}
              >
                <History className="size-4" />
                History
              </Button>
            )}

            <Button
              variant="secondary"
              disabled={isExporting}
              onClick={onDownload}
            >
              {isExporting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              disabled={isExporting}
              onClick={onPrint}
            >
              <Printer className="size-4" />
              Print
            </Button>
            <ModeToggle />
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-card px-4 py-3 text-sm">
            <div className="font-medium text-destructive">Export failed</div>
            <div className="mt-1 text-muted-foreground">{error}</div>
          </div>
        )}

        <Card className="relative flex min-h-[70dvh] flex-1 overflow-hidden">
          {canSplit ? (
            <PanelGroup direction="horizontal" className="h-full w-full">
              <Panel minSize={50} defaultSize={72}>
                <PanelGroup direction="horizontal" className="h-full w-full">
                  <Panel minSize={25} defaultSize={50}>
                    <div className="flex h-full flex-col">
                      <WorkbenchHeader title="Editor" />
                      <div className="min-h-0 flex-1">
                        <MdEditor
                          value={markdownText}
                          onChange={onEditorChange}
                        />
                      </div>
                    </div>
                  </Panel>
                  <PanelResizeHandle className="relative w-px bg-border">
                    <div className="absolute inset-y-0 -left-1 w-2" />
                  </PanelResizeHandle>
                  <Panel minSize={25} defaultSize={50}>
                    <div className="flex h-full flex-col">
                      <WorkbenchHeader title="Preview" />
                      <div className="min-h-0 flex-1 bg-background">
                        <MdPreview markdown={markdownText} />
                      </div>
                    </div>
                  </Panel>
                </PanelGroup>
              </Panel>

              <PanelResizeHandle className="relative w-px bg-border">
                <div className="absolute inset-y-0 -left-1 w-2" />
              </PanelResizeHandle>

              <Panel minSize={18} maxSize={40} defaultSize={28}>
                <div className="h-full border-l bg-card">
                  <MdHistory
                    docs={displayFilteredDocs}
                    totalCount={displayDocs.length}
                    activeDocId={history.activeDocId}
                    query={history.query}
                    onQueryChange={history.setQuery}
                    onNew={onNewDoc}
                    onSelect={onSelectDoc}
                    onDelete={onDeleteDoc}
                    isLoading={isHistoryHydrating}
                    extraActions={
                      isHistoryHydrating ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : null
                    }
                  />
                </div>
              </Panel>
            </PanelGroup>
          ) : viewMode === "editor" ? (
            <div className="flex h-full flex-col">
              <WorkbenchHeader title="Editor" />
              <div className="min-h-0 flex-1">
                <MdEditor value={markdownText} onChange={onEditorChange} />
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <WorkbenchHeader title="Preview" />
              <div className="min-h-0 flex-1 bg-background">
                <MdPreview markdown={markdownText} />
              </div>
            </div>
          )}
        </Card>

        {!canSplit && isHistoryOpen && (
          <div className="fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsHistoryOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              className="absolute right-0 top-0 h-full w-[min(420px,90vw)] border-l bg-card shadow-xl"
            >
              <MdHistory
                docs={displayFilteredDocs}
                totalCount={displayDocs.length}
                activeDocId={history.activeDocId}
                query={history.query}
                onQueryChange={history.setQuery}
                onNew={onNewDoc}
                onSelect={onSelectDoc}
                onDelete={onDeleteDoc}
                isLoading={isHistoryHydrating}
                extraActions={
                  <div className="flex items-center gap-1">
                    {isHistoryHydrating && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    <HistoryCloseButton onClose={() => setIsHistoryOpen(false)} />
                  </div>
                }
              />
            </div>
          </div>
        )}

        <footer className="flex flex-col gap-2 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <div>
            From Markdown to PDF, beautifully simple. •{" "}
            <a
              href="https://github.com/neozhu/md-to-pdf-app"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/60 hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Open source on GitHub
            </a>{" "}
            — feedback welcome!
          </div>
          <div className="text-foreground/70">
            Tip: add frontmatter, tables, and code blocks.
          </div>
        </footer>
      </div>
    </div>
  );
}

function WorkbenchHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between border-b bg-card px-4 py-2">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">Markdown</div>
    </div>
  );
}

function useIsLgUp() {
  const [isLgUp, setIsLgUp] = React.useState(false);

  React.useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLgUp(mediaQuery.matches);

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  return isLgUp;
}
