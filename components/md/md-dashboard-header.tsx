"use client";

import {
  Download,
  Github,
  Loader2,
  Menu,
  Printer,
  WandSparkles,
} from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ViewMode = "split" | "editor" | "preview";

type MdDashboardHeaderProps = {
  canSplit: boolean;
  viewMode: ViewMode;
  setViewMode: (next: ViewMode) => void;
  onOpenSidebar: () => void;
  fileName: string;
  onFileNameChange: (value: string) => void;
  isBusy: boolean;
  canExport: boolean;
  exportingAction: "download" | "print" | null;
  isAiReviewing: boolean;
  onDownload: () => void;
  onAiReview: () => void;
  onPrint: () => void;
};

export function MdDashboardHeader({
  canSplit,
  viewMode,
  setViewMode,
  onOpenSidebar,
  fileName,
  onFileNameChange,
  isBusy,
  canExport,
  exportingAction,
  isAiReviewing,
  onDownload,
  onAiReview,
  onPrint,
}: MdDashboardHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/70 py-2 backdrop-blur">
      <div className="flex min-h-[40px] flex-col gap-2 px-4 md:flex-row md:items-center md:justify-between md:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {!canSplit && (
            <Button
              variant="outline"
              size="icon"
              aria-label="Open menu"
              onClick={onOpenSidebar}
            >
              <Menu className="size-4" />
            </Button>
          )}

          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center overflow-hidden rounded-md bg-primary">
              <svg
                width="28"
                height="28"
                viewBox="0 0 64 64"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <rect width="64" height="64" fill="#2563eb" />
                <path
                  d="M16 20C16 18.8954 16.8954 18 18 18H46C47.1046 18 48 18.8954 48 20V44C48 45.1046 47.1046 46 46 46H18C16.8954 46 16 45.1046 16 44V20Z"
                  fill="white"
                />
                <path
                  d="M22 26L22 38L26 38L26 32L28 35L30 32L30 38L34 38L34 26L30 26L28 30.5L26 26L22 26Z"
                  fill="#2563eb"
                />
                <path
                  d="M36 26L36 38L40 38L42 35L42 38L46 38L46 26L42 26L40 29L40 26L36 26Z"
                  fill="#2563eb"
                  fillOpacity="0.7"
                />
              </svg>
            </div>
            <div className="flex flex-col gap-0.5 leading-tight">
              <div className="text-[11px] font-semibold tracking-tight">MD → PDF</div>
              <div className="text-[10px] text-muted-foreground">
                Write, preview & export to PDF
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Input
            value={fileName}
            onChange={(e) => onFileNameChange(e.target.value)}
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

          <Button variant="outline" size="icon">
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
  );
}

