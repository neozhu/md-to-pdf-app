-- Global Review Profiles for authenticated personal use.
-- Run this in Supabase SQL Editor.

create table if not exists public.review_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  reviewer_guidance text not null check (char_length(btrim(reviewer_guidance)) between 1 and 4000),
  editor_guidance text not null check (char_length(btrim(editor_guidance)) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.review_profiles enable row level security;

grant select, insert, update, delete on public.review_profiles to authenticated;
revoke all on public.review_profiles from anon;

drop policy if exists "review_profiles_select_authenticated" on public.review_profiles;
create policy "review_profiles_select_authenticated"
  on public.review_profiles for select to authenticated using (true);

drop policy if exists "review_profiles_insert_authenticated" on public.review_profiles;
create policy "review_profiles_insert_authenticated"
  on public.review_profiles for insert to authenticated with check (true);

drop policy if exists "review_profiles_update_authenticated" on public.review_profiles;
create policy "review_profiles_update_authenticated"
  on public.review_profiles for update to authenticated
  using (true) with check (true);

drop policy if exists "review_profiles_delete_authenticated" on public.review_profiles;
create policy "review_profiles_delete_authenticated"
  on public.review_profiles for delete to authenticated using (true);

insert into public.review_profiles (
  id,
  name,
  description,
  reviewer_guidance,
  editor_guidance
) values
(
  '00000000-0000-4000-8000-000000000001',
  'General',
  'Balanced review for clarity, structure, and tone.',
  'Review as a general professional document. Prioritize clear structure, unambiguous wording, and consistent tone without imposing a specialized style.',
  'Apply only targeted edits that improve clarity, structure, or tone while preserving the author''s intent.'
),
(
  '00000000-0000-4000-8000-000000000002',
  'Technical Doc',
  'Focus on technical accuracy, steps, terminology, and code blocks.',
  'Review as technical documentation. Prioritize technical documentation clarity, prerequisite gaps, step ordering, terminology consistency, command/code readability, and warnings where a reader could implement the wrong thing.',
  'Preserve technical accuracy. Do not change commands, identifiers, APIs, paths, flags, versions, code blocks, or configuration values unless the approved review explicitly instructs a correction.'
),
(
  '00000000-0000-4000-8000-000000000003',
  'Academic / Formal',
  'Focus on logic, formality, transitions, and restrained wording.',
  'Review as academic or formal writing. Prioritize argument flow, paragraph transitions, claim support, formality, and vague wording. Avoid marketing-style rewrites.',
  'Keep the tone formal and restrained. Improve logical transitions and precision without making the prose promotional or changing claims.'
)
on conflict (id) do nothing;
