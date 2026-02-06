import type { MdHistoryDoc } from "@/lib/md-history";

async function readErrorMessage(res: Response) {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.message ?? data.error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function listMdHistoryDocs(signal?: AbortSignal) {
  const res = await fetch("/api/md-history", { signal });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = (await res.json()) as { docs: MdHistoryDoc[] };
  return data.docs;
}

export async function createMdHistoryDoc(doc: MdHistoryDoc) {
  const res = await fetch("/api/md-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = (await res.json()) as { doc: MdHistoryDoc };
  return data.doc;
}

export async function upsertMdHistoryDoc(doc: MdHistoryDoc) {
  const res = await fetch(`/api/md-history/${encodeURIComponent(doc.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
  const data = (await res.json()) as { doc: MdHistoryDoc };
  return data.doc;
}

export async function deleteMdHistoryDoc(id: string) {
  const res = await fetch(`/api/md-history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await readErrorMessage(res));
}

