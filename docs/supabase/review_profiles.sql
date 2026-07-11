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
  'Balanced professional review of purpose, structure, clarity, consistency, and tone.',
  'Review this as a general professional document for readers who need to understand its purpose and act with confidence.

Prioritize:
- whether the purpose and main takeaway are clear early;
- whether headings, paragraphs, and transitions create a coherent reading path;
- ambiguous, dense, or internally inconsistent wording; and
- inconsistent terminology, scope, or tone that could reduce understanding or trust.

Use a balanced reporting threshold. Report only issues with a clear reader impact. Do not impose a specialized style or suggest cosmetic polish.',
  'Apply only the approved, localized changes needed to improve purpose, structure, clarity, terminology consistency, or professional tone. Preserve the author''s meaning, voice, factual claims, examples, and all unaffected text.'
),
(
  '00000000-0000-4000-8000-000000000002',
  'Technical Doc',
  'Higher-recall review of prerequisites, procedures, code/prose consistency, and operational ambiguity.',
  'Review this as technical documentation for readers who may rely on it to understand, configure, implement, or operate a system.

Use higher recall for issues that could block or mislead implementation. Prioritize:
- missing prerequisites, assumptions, dependencies, permissions, or environment requirements implied by later steps or stated elsewhere in the document;
- incorrect, ambiguous, or unsafe step order visible from the documented procedure;
- inconsistencies between prose, commands, code, configuration, identifiers, paths, flags, APIs, and versions;
- missing expected results, failure conditions, warnings, or recovery guidance where the document shows that readers could act incorrectly; and
- terminology drift and references whose targets are unclear.

Distinguish a document-supported defect from an externally unverifiable concern. Do not invent technical corrections or rewrite valid code for style.',
  'Apply only approved corrections. Preserve technical behavior and do not change commands, code, identifiers, APIs, paths, flags, versions, configuration values, or factual claims unless the approved review explicitly identifies that exact change. Keep steps executable and code blocks valid.'
),
(
  '00000000-0000-4000-8000-000000000003',
  'Academic / Formal',
  'Formal review of argument flow, evidence-to-conclusion logic, qualification, and precision.',
  'Review this as academic or formal writing for readers evaluating the argument''s clarity, coherence, and support.

Prioritize:
- an unclear thesis, purpose, or scope;
- gaps between claims, evidence, reasoning, and conclusions;
- unsupported leaps, overstatement, missing qualification, or internal contradiction visible in the text;
- weak paragraph progression, transitions, or referents that obscure the argument; and
- imprecise terminology, inconsistent definitions, or tone that is promotional, informal, or stronger than the evidence supports.

Do not require a particular citation style or claim external factual errors unless the document supplies the evidence. Avoid marketing-style rewrites.',
  'Apply only approved changes that improve argument flow, qualification, transitions, terminology, and formal precision. Preserve claims, evidence, citations, scope, and disciplinary meaning. Do not strengthen conclusions or introduce new support.'
)
on conflict (id) do nothing;
