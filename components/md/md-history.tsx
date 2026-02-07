"use client";

import * as React from "react";
import { Plus, Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { MdHistoryDoc } from "@/lib/md-history";
import { getMarkdownSummary } from "./use-md-history";

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
  isLoading = false,
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
  isLoading?: boolean;
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
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-background px-3 py-2"
              >
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : docs.length === 0 ? (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            No matching documents.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {docs.map((doc, index) => {
              const isActive = doc.id === activeDocId;
              const summary = getMarkdownSummary(doc.markdown, 80);
              const selectDoc = () => onSelect(doc.id);
              return (
                <button
                  key={doc.id}
                  type="button"
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    e.preventDefault();
                    selectDoc();
                  }}
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`,
                  }}
                  className={cn(
                    "group w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    isActive
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background hover:bg-accent/40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="truncate text-sm font-medium">
                          {doc.mdFileName}
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                          {formatRelativeTime(doc.updatedAt)}
                        </div>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {summary || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 opacity-70 hover:opacity-100"
                        aria-label={`Delete ${doc.mdFileName}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
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
