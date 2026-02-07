"use client";

import * as React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  createMdHistoryDoc,
  deleteMdHistoryDoc,
  listMdHistoryDocs,
  upsertMdHistoryDoc,
} from "@/lib/md-history-api";
import { printMarkdownLocally } from "@/lib/markdown/print";
import {
  AiReviewProgressDialog,
  type AiAgent,
} from "./ai-review-progress-dialog";
import { MdDashboardHeader } from "./md-dashboard-header";
import { MdHistorySidebarContent } from "./md-history-sidebar-content";
import { MdEditor } from "./md-editor";
import { MdPreview } from "./md-preview";
import {
  mdFileNameToPdfFileName,
  useMdHistory,
} from "./use-md-history";

type ViewMode = "split" | "editor" | "preview";
type AiToolInsights = {
  structureRecoveryDetected?: boolean;
  structureCues?: string[];
  rawBlockCount?: number;
  headingCandidateCount?: number;
  listCandidateCount?: number;
  codeCandidateCount?: number;
  recoveredCodeBlockCount?: number;
  factualRiskLevel?: "low" | "medium" | "high";
  factualWarnings?: string[];
};
type AiReviewResponse = {
  review?: string;
  keyImprovements?: string[];
  polishedMarkdown?: string;
  changed?: boolean;
  toolInsights?: AiToolInsights;
  error?: string;
};

function formatToolInsights(insights?: AiToolInsights) {
  if (!insights) return "";
  const parts: string[] = [];
  if (insights.structureRecoveryDetected) {
    parts.push("structure rebuild enabled");
  }
  if (typeof insights.rawBlockCount === "number") {
    parts.push(
      `blocks ${insights.rawBlockCount} (h${insights.headingCandidateCount ?? 0}/l${insights.listCandidateCount ?? 0}/c${insights.codeCandidateCount ?? 0})`,
    );
  }
  if (
    typeof insights.recoveredCodeBlockCount === "number" &&
    insights.recoveredCodeBlockCount > 0
  ) {
    parts.push(`code blocks recovered ${insights.recoveredCodeBlockCount}`);
  }
  if (insights.factualRiskLevel) {
    parts.push(`factual risk ${insights.factualRiskLevel}`);
  }
  const factualWarnings = insights.factualWarnings ?? [];
  if (factualWarnings.length > 0) {
    parts.push(factualWarnings[0]);
  }
  return parts.join(" · ");
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

  async function requestPdf() {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: markdownText,
        fileName,
        disposition: "attachment",
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
      const blob = await requestPdf();
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
      await printMarkdownLocally(markdownText, fileName);
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
      const insightsSummary = formatToolInsights(data.toolInsights);

      if (data.changed === false) {
        toast.message("AI reviewed the document but found only minimal edits.", {
          description: insightsSummary ? `${summary} · ${insightsSummary}` : summary,
          duration: 4000,
        });
      } else {
        toast.success("AI optimization applied", {
          description: detail ? `${summary} · ${detail}` : summary,
          duration: 4500,
        });
        if (insightsSummary) {
          toast.message("AI tool insights", {
            description: insightsSummary,
            duration: 4500,
          });
        }
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

  const renderSidebarContent = (rightSlot?: React.ReactNode) => (
    <MdHistorySidebarContent
      rightSlot={rightSlot}
      isHistoryHydrating={isHistoryHydrating}
      filteredDocs={filteredDocs}
      displayDocsCount={displayDocs.length}
      query={history.query}
      onQueryChange={history.setQuery}
      activeDocId={history.activeDocId}
      onRefresh={onRefresh}
      onNewDoc={onNewDoc}
      onSelectDoc={onSelectDoc}
      onDeleteDoc={onDeleteDoc}
    />
  );

  return (
    <div className="min-h-dvh text-xs">
      <div className="relative flex min-h-dvh w-full flex-col">
        <MdDashboardHeader
          canSplit={canSplit}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          fileName={fileName}
          onFileNameChange={setFileName}
          isBusy={isBusy}
          canExport={canExport}
          exportingAction={exportingAction}
          isAiReviewing={isAiReviewing}
          onDownload={onDownload}
          onAiReview={onAiReview}
          onPrint={onPrint}
        />

        <div className="relative flex min-h-0 flex-1 px-4 pt-4 md:px-4 lg:pl-[280px]">
          <SidebarShell className="fixed left-0 top-14 hidden h-[calc(100dvh-3.5rem)] border-r lg:flex">
            {renderSidebarContent()}
          </SidebarShell>

          <main className="flex min-w-0 flex-1 flex-col gap-4">
            <Card className="relative flex min-h-[70dvh] flex-1 overflow-hidden rounded-md border shadow-none">
              {canSplit ? (
                <PanelGroup direction="horizontal">
                  <Panel minSize={25} defaultSize={50}>
                    <div className="flex h-full flex-col">
                      <WorkbenchHeader title="Editor" />
                      <div className="min-h-0 flex-1">
                        <MdEditor
                          key={`editor-${history.activeDocId}`}
                          value={markdownText}
                          onChange={onEditorChange}
                        />
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
                    <MdEditor
                      key={`editor-${history.activeDocId}`}
                      value={markdownText}
                      onChange={onEditorChange}
                    />
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
              Turn raw notes into publication-ready PDFs with AI Review. •{" "}
              <a
                href="https://github.com/neozhu/md-to-pdf-app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground/60 hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Open source on GitHub
              </a>{" "}
              — help shape what ships next.
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
              {renderSidebarContent(
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

        <AiReviewProgressDialog
          open={isAiDialogOpen}
          activeAgent={aiActiveAgent}
          dialogError={aiDialogError}
          dialogMessage={aiDialogMessage}
          isAiReviewing={isAiReviewing}
          onClose={() => setIsAiDialogOpen(false)}
        />
      </div>
    </div>
  );
}
