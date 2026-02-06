-- MD History storage (no auth / no RLS considered)
-- Run this in Supabase SQL Editor.

create table if not exists public.md_history_docs (
  id text primary key,
  md_file_name text not null,
  markdown text not null,
  updated_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists md_history_docs_updated_at_ms_idx
  on public.md_history_docs (updated_at_ms desc);

