"use client";

import * as React from "react";
import { Download, History, Loader2, Printer, Sparkles } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { HistoryCloseButton, MdHistory } from "./md-history";
import { MdEditor } from "./md-editor";
import { MdPreview } from "./md-preview";
import { sampleMarkdown } from "./sample-markdown";
import {
  createDummyHistoryDocs,
  mdFileNameToPdfFileName,
  useMdHistory,
} from "./use-md-history";

type ViewMode = "split" | "editor" | "preview";

export function MdWorkbench() {
  const initialHistoryDocs = React.useMemo(
    () => createDummyHistoryDocs(sampleMarkdown),
    [],
  );
  const history = useMdHistory(initialHistoryDocs);

  const [markdownText, setMarkdownText] = React.useState(
    () => initialHistoryDocs[0].markdown,
  );
  const [viewMode, setViewMode] = React.useState<ViewMode>("split");
  const [fileName, setFileName] = React.useState(() =>
    mdFileNameToPdfFileName(initialHistoryDocs[0].mdFileName),
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

  React.useEffect(() => {
    if (canSplit) setIsHistoryOpen(false);
  }, [canSplit]);

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
      const blob = await requestPdf("inline");
      printBlob(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setIsExporting(false);
    }
  }

  function onNewDoc() {
    const doc = history.createNew(markdownText);
    setMarkdownText(doc.markdown);
    setIsHistoryOpen(false);
  }

  function onSelectDoc(id: string) {
    const doc = history.switchTo(id, markdownText);
    if (!doc) return;
    setMarkdownText(doc.markdown);
    setIsHistoryOpen(false);
  }

  function onDeleteDoc(id: string) {
    const nextActive = history.remove(id);
    if (nextActive) setMarkdownText(nextActive.markdown);
  }

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
                          onChange={setMarkdownText}
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
                    docs={history.filteredDocs}
                    totalCount={history.docs.length}
                    activeDocId={history.activeDocId}
                    query={history.query}
                    onQueryChange={history.setQuery}
                    onNew={onNewDoc}
                    onSelect={onSelectDoc}
                    onDelete={onDeleteDoc}
                  />
                </div>
              </Panel>
            </PanelGroup>
          ) : viewMode === "editor" ? (
            <div className="flex h-full flex-col">
              <WorkbenchHeader title="Editor" />
              <div className="min-h-0 flex-1">
                <MdEditor value={markdownText} onChange={setMarkdownText} />
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
                docs={history.filteredDocs}
                totalCount={history.docs.length}
                activeDocId={history.activeDocId}
                query={history.query}
                onQueryChange={history.setQuery}
                onNew={onNewDoc}
                onSelect={onSelectDoc}
                onDelete={onDeleteDoc}
                extraActions={
                  <HistoryCloseButton onClose={() => setIsHistoryOpen(false)} />
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
