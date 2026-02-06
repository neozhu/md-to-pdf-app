"use client";

import * as React from "react";

import type { MdHistoryDoc } from "@/lib/md-history";

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function timestampSlug(ms: number) {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${yyyy}${mm}${dd}-${hh}${min}`;
}

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeMdFileName(prefix: string, nowMs: number) {
  return `${prefix}-${timestampSlug(nowMs)}.md`;
}

export function mdFileNameToPdfFileName(mdFileName: string) {
  const base = mdFileName.toLowerCase().endsWith(".md")
    ? mdFileName.slice(0, -3)
    : mdFileName;
  return `${base}.pdf`;
}

export function getMarkdownSummary(markdown: string, maxLen = 80) {
  const singleLine = markdown.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLen) return singleLine;
  return `${singleLine.slice(0, maxLen - 1)}…`;
}

function sortDocsByUpdatedAtDesc(docs: MdHistoryDoc[]) {
  return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
}

function saveActiveInList(
  docs: MdHistoryDoc[],
  activeDocId: string,
  currentMarkdown: string,
  nowMs: number,
) {
  const active = docs.find((doc) => doc.id === activeDocId);
  if (!active) return docs;
  if (active.markdown === currentMarkdown) return docs;

  const updated = {
    ...active,
    markdown: currentMarkdown,
    updatedAt: nowMs,
  } satisfies MdHistoryDoc;

  const next = docs.map((doc) => (doc.id === activeDocId ? updated : doc));
  return sortDocsByUpdatedAtDesc(next);
}

export function useMdHistory(initialDocs: MdHistoryDoc[]) {
  const safeInitialDocs = React.useMemo(() => {
    if (initialDocs.length > 0) return initialDocs;
    const now = Date.now();
    return [
      {
        id: "doc-initial",
        mdFileName: makeMdFileName("untitled", now),
        markdown: "",
        updatedAt: now,
      },
    ] satisfies MdHistoryDoc[];
  }, [initialDocs]);

  const sortedInitialDocs = React.useMemo(
    () => sortDocsByUpdatedAtDesc(safeInitialDocs),
    [safeInitialDocs],
  );

  const [docs, setDocs] = React.useState<MdHistoryDoc[]>(() => sortedInitialDocs);
  const [activeDocId, setActiveDocId] = React.useState(
    () => sortedInitialDocs[0].id,
  );
  const [query, setQuery] = React.useState("");

  const activeDoc =
    docs.find((doc) => doc.id === activeDocId) ?? docs[0] ?? safeInitialDocs[0];

  const filteredDocs = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;

    return docs.filter((doc) => {
      const haystack = `${doc.mdFileName} ${getMarkdownSummary(doc.markdown, 240)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [docs, query]);

  function createNew(currentMarkdown: string) {
    const nowMs = Date.now();
    const active = docs.find((doc) => doc.id === activeDocId);
    const savedActiveDoc =
      active && active.markdown !== currentMarkdown
        ? ({
            ...active,
            markdown: currentMarkdown,
            updatedAt: nowMs,
          } satisfies MdHistoryDoc)
        : null;

    const nextDoc = {
      id: makeId(),
      mdFileName: makeMdFileName("untitled", nowMs),
      markdown: "",
      updatedAt: nowMs,
    } satisfies MdHistoryDoc;

    setDocs((prev) => {
      const saved = saveActiveInList(prev, activeDocId, currentMarkdown, nowMs);
      return sortDocsByUpdatedAtDesc([nextDoc, ...saved]);
    });
    setActiveDocId(nextDoc.id);
    return { doc: nextDoc, savedActiveDoc };
  }

  function switchTo(targetId: string, currentMarkdown: string) {
    const target = docs.find((doc) => doc.id === targetId);
    if (!target) return null;

    // If selecting the same document, don't switch
    if (targetId === activeDocId) {
      return null;
    }

    const nowMs = Date.now();
    const active = docs.find((doc) => doc.id === activeDocId);
    const savedActiveDoc =
      active && active.markdown !== currentMarkdown
        ? ({
            ...active,
            markdown: currentMarkdown,
            updatedAt: nowMs,
          } satisfies MdHistoryDoc)
        : null;

    // Immediately update local state before switching
    const updatedDocs = saveActiveInList(docs, activeDocId, currentMarkdown, nowMs);
    setDocs(updatedDocs);
    setActiveDocId(targetId);
    return { doc: target, savedActiveDoc };
  }

  function remove(id: string) {
    const nextDocs = sortDocsByUpdatedAtDesc(docs.filter((doc) => doc.id !== id));

    if (nextDocs.length === 0) {
      const nowMs = Date.now();
      const nextDoc = {
        id: makeId(),
        mdFileName: makeMdFileName("untitled", nowMs),
        markdown: "",
        updatedAt: nowMs,
      } satisfies MdHistoryDoc;
      setDocs([nextDoc]);
      setActiveDocId(nextDoc.id);
      return { nextActiveDoc: nextDoc, createdDoc: nextDoc };
    }

    if (id === activeDocId) {
      setDocs(nextDocs);
      setActiveDocId(nextDocs[0].id);
      return { nextActiveDoc: nextDocs[0] };
    }

    setDocs(nextDocs);
    return { nextActiveDoc: null };
  }

  function hydrate(incomingDocs: MdHistoryDoc[]) {
    if (!incomingDocs || incomingDocs.length === 0) return null;

    const nextDocs = sortDocsByUpdatedAtDesc(incomingDocs);
    
    // If we have real docs from database, always use them
    // Don't keep the initial empty doc
    const nextActiveId = nextDocs[0]?.id;

    if (!nextActiveId) return null;

    setDocs(nextDocs);
    setActiveDocId(nextActiveId);

    return nextDocs[0] ?? null;
  }

  function updateDoc(updatedDoc: MdHistoryDoc) {
    setDocs((prev) => {
      const next = prev.map((doc) =>
        doc.id === updatedDoc.id ? updatedDoc : doc
      );
      return sortDocsByUpdatedAtDesc(next);
    });
  }

  return {
    docs,
    filteredDocs,
    activeDocId,
    activeDoc,
    query,
    setQuery,
    createNew,
    switchTo,
    remove,
    hydrate,
    updateDoc,
  };
}
