"use client";

import * as React from "react";
import {
  Download,
  Loader2,
  Menu,
  Plus,
  Printer,
  RefreshCw,
  WandSparkles,
  X,
  Trash2,
  Github,
} from "lucide-react";
import { toast } from "sonner";
import { marked } from "marked";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  createMdHistoryDoc,
  deleteMdHistoryDoc,
  listMdHistoryDocs,
  upsertMdHistoryDoc,
} from "@/lib/md-history-api";
import { MdEditor } from "./md-editor";
import { MdPreview } from "./md-preview";
import {
  getMarkdownSummary,
  mdFileNameToPdfFileName,
  useMdHistory,
} from "./use-md-history";

type ViewMode = "split" | "editor" | "preview";
type AiAgent = "reviewer" | "editor" | null;
type AiReviewResponse = {
  review?: string;
  keyImprovements?: string[];
  polishedMarkdown?: string;
  changed?: boolean;
  error?: string;
};

function formatRelativeTime(updatedAtMs: number) {
  const now = Date.now();
  const diff = now - updatedAtMs;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  // Show date (MM/DD) for older than 7 days
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
  }).format(updatedAtMs);
}

function WorkbenchHeader({ title }: { title: string }) {
  return (
    <div className="flex h-8 items-center justify-between border-b bg-card px-3">
      <div className="text-xs font-medium">{title}</div>
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

function SidebarShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "flex w-[260px] flex-col border bg-card",
        className,
      )}
    >
      {children}
    </aside>
  );
}

export function MdDashboard() {
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
  const [exportingAction, setExportingAction] = React.useState<
    "download" | "print" | null
  >(null);
  const [isAiReviewing, setIsAiReviewing] = React.useState(false);
  const [aiActiveAgent, setAiActiveAgent] = React.useState<AiAgent>(null);
  const [aiDialogMessage, setAiDialogMessage] = React.useState("");
  const [aiDialogError, setAiDialogError] = React.useState<string | null>(null);
  const [isAiDialogOpen, setIsAiDialogOpen] = React.useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

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
    if (canSplit) setIsSidebarOpen(false);
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
    if (!isSidebarOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isSidebarOpen]);

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
    a.download = fileName.toLowerCase().endsWith(".pdf")
      ? fileName
      : `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onDownload() {
    setExportingAction("download");
    try {
      const blob = await requestPdf("attachment");
      downloadBlob(blob);
      // Show success toast after download starts
            toast.success("PDF downloaded!", {
              duration: 2500,
            });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setExportingAction(null);
    }
  }

  async function onPrint() {
    setExportingAction("print");
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
      toast.error(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setExportingAction(null);
    }
  }

  async function onAiReview() {
    if (!markdownText.trim()) {
      toast.error("Please write some Markdown first.");
      return;
    }

    setIsAiReviewing(true);
    setIsAiDialogOpen(true);
    setAiDialogError(null);
    setAiActiveAgent("reviewer");
    setAiDialogMessage("Reviewer Agent is preparing...");

    try {
      const res = await fetch("/api/ai-review?stream=1", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ markdown: markdownText }),
      });

      if (!res.ok) {
        const fallback = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(fallback.error ?? `AI review failed (${res.status})`);
      }

      if (!res.body) {
        throw new Error("Empty AI response stream.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: AiReviewResponse | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const lines = chunk
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean);
          if (lines.length === 0) continue;

          const eventLine = lines.find((line) => line.startsWith("event:"));
          const dataLine = lines.find((line) => line.startsWith("data:"));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice("event:".length).trim();
          const dataText = dataLine.slice("data:".length).trim();
          let payload: unknown;
          try {
            payload = JSON.parse(dataText);
          } catch {
            continue;
          }

          if (event === "stage") {
            const stage = payload as {
              agent?: AiAgent;
              message?: string;
              status?: "started" | "completed";
            };
            if (stage.agent === "reviewer" || stage.agent === "editor") {
              setAiActiveAgent(stage.agent);
            }
            if (stage.message) {
              setAiDialogMessage(stage.message);
            }
          } else if (event === "result") {
            finalResult = payload as AiReviewResponse;
          } else if (event === "error") {
            const err = payload as { message?: string };
            throw new Error(err.message || "AI review failed.");
          }
        }
      }

      const data = finalResult ?? {};
      if (!data.polishedMarkdown || typeof data.polishedMarkdown !== "string") {
        throw new Error("AI response missing polished markdown.");
      }

      didUserEditRef.current = true;
      setMarkdownText(data.polishedMarkdown);

      const summary = data.review?.trim() || "Document polished by AI editor.";
      const detail = Array.isArray(data.keyImprovements)
        ? data.keyImprovements.slice(0, 3).join(" | ")
        : "";

      if (data.changed === false) {
        toast.message("AI reviewed the document but found only minimal edits.", {
          description: summary,
          duration: 4000,
        });
      } else {
        toast.success("AI optimization applied", {
          description: detail ? `${summary} · ${detail}` : summary,
          duration: 4500,
        });
      }
      setIsAiDialogOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : "AI review failed.";
      setAiDialogError(message);
      setAiDialogMessage("Execution stopped due to an error.");
      toast.error(message);
    } finally {
      setIsAiReviewing(false);
    }
  }

  async function onNewDoc() {
    didUserEditRef.current = true;
    const result = history.createNew(markdownText);
    setMarkdownText(result.doc.markdown);
    setIsSidebarOpen(false);

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
      setIsSidebarOpen(false);
      return;
    }

    didUserEditRef.current = true;
    const result = history.switchTo(id, markdownText);
    if (!result) return;
    setMarkdownText(result.doc.markdown);
    setIsSidebarOpen(false);

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
    const ok = window.confirm(
      `Delete "${history.docs.find((d) => d.id === id)?.mdFileName ?? "this document"}" from history?`,
    );
    if (!ok) return;

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

  async function onRefresh() {
    setIsHistoryHydrating(true);
    try {
      const docs = await listMdHistoryDocs();
      const nonEmptyDocs = docs.filter(doc => doc.markdown.trim() !== "");
      const nextActive = history.hydrate(nonEmptyDocs);
      if (nextActive && nextActive.id === history.activeDocId) {
        // Keep current content if still on the same document
      } else if (nextActive) {
        setMarkdownText(nextActive.markdown);
      }
      toast.success("Refreshed", {
        duration: 1000,
        position: "bottom-right",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to refresh.");
    } finally {
      setIsHistoryHydrating(false);
    }
  }

  // Filter out empty initial docs from display
  const displayDocs = hasLoadedFromDb ? history.docs : history.docs.filter(doc => doc.markdown.trim() !== "");
  const displayFilteredDocs = hasLoadedFromDb ? history.filteredDocs : history.filteredDocs.filter(doc => doc.markdown.trim() !== "");

  const filteredDocs = displayFilteredDocs;
  const canExport = markdownText.trim().length > 0;
  const isExporting = exportingAction !== null;
  const isBusy = isExporting || isAiReviewing;

  const sidebarContent = (rightSlot?: React.ReactNode) => (
    <>
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button 
              variant="secondary" 
              size="icon" 
              className="h-8 w-8"
              onClick={onRefresh}
              disabled={isHistoryHydrating}
              aria-label="Refresh history"
            >
              <RefreshCw className={cn("size-4", isHistoryHydrating && "animate-spin")} />
            </Button>
            <Button variant="secondary" size="sm" onClick={onNewDoc}>
              <Plus className="size-4" />
              New
            </Button>
            
          </div>
          <div className="flex items-center gap-2">
            {rightSlot}
            <div className="text-xs text-muted-foreground">
              {filteredDocs.length}/{displayDocs.length}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <Input
            value={history.query}
            onChange={(e) => history.setQuery(e.target.value)}
            placeholder="Search docs…"
            aria-label="Search documents"
          />
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-auto p-2">
        <div className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">
          History
        </div>

        {isHistoryHydrating ? (
          <div className="flex flex-col gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="rounded-md border border-border/40 px-2.5 py-2"
              >
                <Skeleton className="h-3 w-3/4 mb-1.5" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No matching documents.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredDocs.map((doc, index) => {
              const isActive = doc.id === history.activeDocId;
              const summary = getMarkdownSummary(doc.markdown, 64);
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDoc(doc.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectDoc(doc.id);
                    }
                  }}
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`,
                  }}
                  className={cn(
                    "group relative w-full rounded-md border px-2.5 py-2 text-left transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 hover:border-border hover:bg-accent/35",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="truncate text-xs font-medium">
                          {doc.mdFileName}
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                          {formatRelativeTime(doc.updatedAt)}
                        </div>
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {summary || "—"}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Delete ${doc.mdFileName}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDeleteDoc(doc.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>

                  {isActive && (
                    <div className="absolute left-0 top-2 bottom-2 rounded-r bg-primary" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>
    </>
  );

  return (
    <div className="min-h-dvh text-xs">
      <div className="relative flex min-h-dvh w-full flex-col">
        <header className="sticky top-0 z-20 border-b bg-background/70 py-2 backdrop-blur">
          <div className="flex min-h-[40px] flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between md:px-6">
            <div className="flex min-w-0 items-center gap-2">
              {!canSplit && (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Open menu"
                  onClick={() => setIsSidebarOpen(true)}
                >
                  <Menu className="size-4" />
                </Button>
              )}

              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-md bg-primary overflow-hidden">
                  <svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="64" height="64" fill="#2563eb"/>
                    <path d="M16 20C16 18.8954 16.8954 18 18 18H46C47.1046 18 48 18.8954 48 20V44C48 45.1046 47.1046 46 46 46H18C16.8954 46 16 45.1046 16 44V20Z" fill="white"/>
                    <path d="M22 26L22 38L26 38L26 32L28 35L30 32L30 38L34 38L34 26L30 26L28 30.5L26 26L22 26Z" fill="#2563eb"/>
                    <path d="M36 26L36 38L40 38L42 35L42 38L46 38L46 26L42 26L40 29L40 26L36 26Z" fill="#2563eb" fillOpacity="0.7"/>
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5 leading-tight">
                  <div className="text-[11px] font-semibold tracking-tight">
                    MD → PDF
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Write, preview & export to PDF
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Input
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="w-[180px] sm:w-[200px] md:w-[220px]"
                placeholder="export.pdf"
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

              <Button
                variant="secondary"
                disabled={isBusy || !canExport}
                onClick={onDownload}
                className="hidden sm:inline-flex"
              >
                {exportingAction === "download" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download PDF
              </Button>
              <Button
                variant="secondary"
                size="icon"
                disabled={isBusy || !canExport}
                onClick={onDownload}
                className="sm:hidden"
                aria-label="Download PDF"
              >
                {exportingAction === "download" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
              </Button>

              <Button
                variant="outline"
                disabled={isBusy || !canExport}
                onClick={onAiReview}
                className="hidden sm:inline-flex"
              >
                {isAiReviewing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
                AI Review
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={isBusy || !canExport}
                onClick={onAiReview}
                className="sm:hidden"
                aria-label="AI Review"
              >
                {isAiReviewing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <WandSparkles className="size-4" />
                )}
              </Button>

              <Button
                variant="outline"
                disabled={isBusy || !canExport}
                onClick={onPrint}
                className="hidden sm:inline-flex"
              >
                {exportingAction === "print" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
                Print
              </Button>
              <Button
                variant="outline"
                size="icon"
                disabled={isBusy || !canExport}
                onClick={onPrint}
                className="sm:hidden"
                aria-label="Print"
              >
                {exportingAction === "print" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Printer className="size-4" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
              >
                <a
                  href="https://github.com/neozhu/md-to-pdf-app"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View on GitHub"
                >
                  <Github className="size-4" />
                </a>
              </Button>

              <ModeToggle />
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1 px-4 pt-4 md:px-4 lg:pl-[280px]">
          <SidebarShell className="fixed left-0 top-14 hidden h-[calc(100dvh-3.5rem)] border-r lg:flex">
            {sidebarContent()}
          </SidebarShell>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <Card className="relative flex min-h-[70dvh] flex-1 overflow-hidden rounded-md border shadow-none">
              {canSplit ? (
                <PanelGroup direction="horizontal">
                  <Panel minSize={25} defaultSize={50}>
                    <div className="flex h-full flex-col">
                      <WorkbenchHeader title="Editor" />
                      <div className="min-h-0 flex-1">
                        <MdEditor value={markdownText} onChange={onEditorChange} />
                      </div>
                    </div>
                  </Panel>
                  <PanelResizeHandle className="relative w-px bg-border">
                    <div className="absolute inset-y-0 -left-2 w-4" />
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

            <footer className="text-[11px] text-muted-foreground">
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
            </footer>
          </main>
        </div>

        {!canSplit && isSidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(false)}
            />
            <SidebarShell className="absolute left-0 top-0 h-full w-[min(360px,88vw)] border-r shadow-xl">
              {sidebarContent(
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Close menu"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className="size-4" />
                </Button>,
              )}
            </SidebarShell>
          </div>
        )}

        {isAiDialogOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 px-4">
            <Card className="w-full max-w-md border shadow-xl">
              <div className="space-y-4 p-5">
                <div className="text-sm font-semibold">Improving Your Document</div>
                <div className="text-xs text-muted-foreground">
                  Please hang tight while we polish your writing. This window will close automatically when everything is ready.
                </div>

                <div className="space-y-2 rounded-md border p-3">
                  <AgentRow
                    title="Review Pass"
                    active={aiActiveAgent === "reviewer" && !aiDialogError}
                    done={aiActiveAgent === "editor" && !aiDialogError}
                  />
                  <AgentRow
                    title="Polish Pass"
                    active={aiActiveAgent === "editor" && !aiDialogError}
                    done={Boolean(aiDialogError) ? false : aiActiveAgent === "editor" && !isAiReviewing}
                  />
                </div>

                <div className="min-h-6 text-xs text-muted-foreground">
                  {aiDialogMessage}
                </div>

                {aiDialogError && (
                  <div className="space-y-3">
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {aiDialogError}
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => setIsAiDialogOpen(false)}>
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function AgentRow({
  title,
  active,
  done,
}: {
  title: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
      <span className="font-medium">{title}</span>
      {done ? (
        <span className="text-emerald-600">Done</span>
      ) : active ? (
        <span className="inline-flex items-center gap-1 text-primary">
          Thinking
          <ThinkingDots />
        </span>
      ) : (
        <span className="text-muted-foreground">Waiting</span>
      )}
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:160ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:320ms]" />
    </span>
  );
}
