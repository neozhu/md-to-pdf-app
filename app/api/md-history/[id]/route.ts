import { NextResponse } from "next/server";

import type { MdHistoryDoc } from "@/lib/md-history";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

const TABLE = "md_history_docs";
const MAX_MARKDOWN_LEN = 1_000_000;
const MAX_FILE_NAME_LEN = 200;

function toDoc(row: {
  id: string;
  md_file_name: string;
  markdown: string;
  updated_at_ms: number | string;
}): MdHistoryDoc {
  const updatedAt = Number(row.updated_at_ms);
  return {
    id: row.id,
    mdFileName: row.md_file_name,
    markdown: row.markdown,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function validateDoc(input: unknown) {
  if (!input || typeof input !== "object") {
    return { ok: false as const, status: 400, error: "Missing doc." };
  }

  const doc = input as Partial<MdHistoryDoc>;

  if (!doc.id || typeof doc.id !== "string") {
    return { ok: false as const, status: 400, error: "Invalid doc.id." };
  }
  if (!doc.mdFileName || typeof doc.mdFileName !== "string") {
    return { ok: false as const, status: 400, error: "Invalid doc.mdFileName." };
  }
  if (doc.mdFileName.length > MAX_FILE_NAME_LEN) {
    return { ok: false as const, status: 413, error: "mdFileName too large." };
  }
  if (typeof doc.markdown !== "string") {
    return { ok: false as const, status: 400, error: "Invalid doc.markdown." };
  }
  if (doc.markdown.length > MAX_MARKDOWN_LEN) {
    return { ok: false as const, status: 413, error: "Markdown too large." };
  }
  if (typeof doc.updatedAt !== "number" || !Number.isFinite(doc.updatedAt)) {
    return { ok: false as const, status: 400, error: "Invalid doc.updatedAt." };
  }

  return { ok: true as const, doc: doc as MdHistoryDoc };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    const parsed = validateDoc((body as { doc?: unknown } | null)?.doc);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }

    if (parsed.doc.id !== id) {
      return NextResponse.json({ error: "Doc id does not match route id." }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    const { data, error } = await supabase
      .from(TABLE)
      .upsert({
        id: parsed.doc.id,
        md_file_name: parsed.doc.mdFileName,
        markdown: parsed.doc.markdown,
        updated_at_ms: parsed.doc.updatedAt,
      } as any)
      .select("id, md_file_name, markdown, updated_at_ms")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ doc: toDoc(data) } satisfies { doc: MdHistoryDoc });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
