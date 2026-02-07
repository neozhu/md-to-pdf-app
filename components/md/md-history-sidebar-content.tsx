"use client";

import * as React from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MdHistoryDoc } from "@/lib/md-history";
import { getMarkdownSummary } from "./use-md-history";

type MdHistorySidebarContentProps = {
  rightSlot?: React.ReactNode;
  isHistoryHydrating: boolean;
  filteredDocs: MdHistoryDoc[];
  displayDocsCount: number;
  query: string;
  onQueryChange: (value: string) => void;
  activeDocId: string;
  onRefresh: () => void;
  onNewDoc: () => void;
  onSelectDoc: (id: string) => void;
  onDeleteDoc: (id: string) => void;
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

  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
  }).format(updatedAtMs);
}

export function MdHistorySidebarContent({
  rightSlot,
  isHistoryHydrating,
  filteredDocs,
  displayDocsCount,
  query,
  onQueryChange,
  activeDocId,
  onRefresh,
  onNewDoc,
  onSelectDoc,
  onDeleteDoc,
}: MdHistorySidebarContentProps) {
  return (
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
              <RefreshCw
                className={cn("size-4", isHistoryHydrating && "animate-spin")}
              />
            </Button>
            <Button variant="secondary" size="sm" onClick={onNewDoc}>
              <Plus className="size-4" />
              New
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {rightSlot}
            <div className="text-xs text-muted-foreground">
              {filteredDocs.length}/{displayDocsCount}
            </div>
          </div>
        </div>
        <div className="mt-2">
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
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
                <Skeleton className="mb-1.5 h-3 w-3/4" />
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
              const isActive = doc.id === activeDocId;
              const summary = getMarkdownSummary(doc.markdown, 64);
              const selectDoc = () => onSelectDoc(doc.id);
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => {
                    if (e.pointerType === "mouse" && e.button !== 0) return;
                    e.preventDefault();
                    selectDoc();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectDoc();
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
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
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
                    <div className="absolute bottom-2 left-0 top-2 rounded-r bg-primary" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>
    </>
  );
}
