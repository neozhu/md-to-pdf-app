"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MdHistoryDoc } from "./use-md-history";
import { getMarkdownSummary } from "./use-md-history";

function formatUpdatedAt(updatedAtMs: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(updatedAtMs);
}

export function MdHistory({
  docs,
  totalCount,
  activeDocId,
  query,
  onQueryChange,
  onNew,
  onSelect,
  onDelete,
  extraActions,
  className,
}: {
  docs: MdHistoryDoc[];
  totalCount: number;
  activeDocId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  extraActions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex items-center justify-between border-b bg-card px-3 py-2">
        <div className="leading-tight">
          <div className="text-sm font-medium">History</div>
          <div className="text-[11px] text-muted-foreground">
            Showing {docs.length} of {totalCount}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="secondary" onClick={onNew}>
            <Plus className="size-4" />
            New
          </Button>
          {extraActions}
        </div>
      </div>

      <div className="border-b bg-card px-3 py-3">
        <Input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search history…"
          aria-label="Search history"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-card p-2">
        {docs.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No matching documents.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {docs.map((doc) => {
              const isActive = doc.id === activeDocId;
              const summary = getMarkdownSummary(doc.markdown, 80);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => onSelect(doc.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "group w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {doc.mdFileName}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {summary || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="hidden whitespace-nowrap text-[10px] text-muted-foreground md:block">
                        {formatUpdatedAt(doc.updatedAt)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-70 hover:opacity-100"
                        aria-label={`Delete ${doc.mdFileName}`}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const ok = window.confirm(
                            `Delete "${doc.mdFileName}" from history?`,
                          );
                          if (!ok) return;
                          onDelete(doc.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function HistoryCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-9 w-9"
      aria-label="Close history"
      onClick={onClose}
    >
      <X className="size-4" />
    </Button>
  );
}

