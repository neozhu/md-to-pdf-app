"use client";

import * as React from "react";
import { Download, History, Loader2, Printer, Sparkles } from "lucide-react";
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

      // Write print-ready HTML with styles (matching PDF generation)
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${fileName}</title>
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
              @media print {
                @page {
                  margin: 1.5cm 1cm;
                }
                html, body {
                  margin: 0;
                  padding: 0;
                }
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
              @media print {
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

      // Trigger print
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } finally {
          setTimeout(() => {
            iframe.remove();
          }, 500);
        }
      };

      // If already loaded, print immediately
      if (iframeDoc.readyState === "complete") {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          iframe.remove();
        }, 500);
      }
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
            <div className="flex size-10 items-center justify-center rounded-xl border bg-card shadow-sm">
              <Sparkles className="size-4 text-foreground" />
            </div>
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">
                MD → PDF
              </div>
              <div className="text-sm text-muted-foreground">
                Edit, preview, export.
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
            Uses <span className="font-medium text-foreground">md-to-pdf</span>{" "}
            to render Markdown into a printable PDF.
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
