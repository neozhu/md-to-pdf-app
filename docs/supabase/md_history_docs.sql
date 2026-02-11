-- MD History storage with Supabase Auth + RLS
-- Run this in Supabase SQL Editor.

create table if not exists public.md_history_docs (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  md_file_name text not null,
  markdown text not null,
  updated_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists md_history_docs_updated_at_ms_idx
  on public.md_history_docs (updated_at_ms desc);

create index if not exists md_history_docs_user_updated_at_idx
  on public.md_history_docs (user_id, updated_at_ms desc);

alter table public.md_history_docs enable row level security;

drop policy if exists "md_history_select_own" on public.md_history_docs;
create policy "md_history_select_own"
  on public.md_history_docs
  for select
  using (auth.uid() = user_id);

drop policy if exists "md_history_insert_own" on public.md_history_docs;
create policy "md_history_insert_own"
  on public.md_history_docs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "md_history_update_own" on public.md_history_docs;
create policy "md_history_update_own"
  on public.md_history_docs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "md_history_delete_own" on public.md_history_docs;
create policy "md_history_delete_own"
  on public.md_history_docs
  for delete
  using (auth.uid() = user_id);
