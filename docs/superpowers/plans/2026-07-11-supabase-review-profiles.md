# Supabase Review Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hard-coded AI Review Profiles with authenticated global CRUD Profiles stored in Supabase, and prevent Review when no Profile exists.

**Architecture:** Add one RLS-protected Supabase table and server CRUD routes that follow the existing authenticated `md-history` pattern. Keep Profile validation and row mapping in a focused library, load Profile guidance server-side in the AI Review route, and keep core Reviewer and Editor constraints in code. Add a focused management component and let `MdDashboard` own Profile loading and selection state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase JS 2, Vercel AI SDK 7, Vitest 4, existing UI components.

## Global Constraints

- Work on branch `feat/supabase-review-profiles` in the existing checkout; do not create a worktree.
- Do not add dependencies.
- Every authenticated user can list, create, update, and physically delete every Profile.
- Do not add `owner_id`, administrator roles, soft deletion, versions, analytics, or prompt scoring.
- Keep core Reviewer and Editor rules in code; store only Profile-specific guidance in Supabase.
- `name` is required and at most 80 characters.
- `description` is required and at most 300 characters.
- `reviewerGuidance` and `editorGuidance` are required and at most 4,000 characters each.
- If no Profile exists or none is selected, disable Review.
- Never fall back to General for a missing or deleted Profile.

---

## File map

- Create `docs/supabase/review_profiles.sql`: table, checks, grants, RLS policies, and seed rows.
- Create `lib/review-profiles.ts`: shared type, validation, database row mapping, and field limits.
- Create `lib/review-profiles.test.ts`: direct tests for validation and row mapping.
- Modify `lib/supabase/auth-server.ts`: add `review_profiles` to the local Supabase `Database` type.
- Create `app/api/review-profiles/route.ts`: list and create Profiles.
- Create `app/api/review-profiles/[id]/route.ts`: update and delete Profiles.
- Create `app/api/review-profiles/route.test.ts`: route contract tests for auth, validation, and CRUD query shape.
- Create `lib/review-profiles-api.ts`: browser-side CRUD request functions.
- Create `lib/review-profiles-api.test.ts`: request and error mapping tests.
- Modify `lib/ai-review/prompts.ts`: split core prompt preambles from final constraints.
- Modify `lib/ai-review/review-profiles.ts`: compose code-owned prompt sections around dynamic guidance.
- Modify `lib/ai-review/review-profiles.test.ts`: replace static-option tests with dynamic composition tests.
- Delete `lib/ai-review/review-profile-options.ts`: remove the static Profile source of truth.
- Modify `lib/ai-review/orchestration.ts`: accept a resolved Profile object instead of a fixed Profile ID.
- Modify `app/api/ai-review/route.ts`: authenticate, resolve `profileId` from Supabase, and return `404` when absent.
- Modify `app/api/ai-review/route.test.ts`: assert authenticated database resolution and no fallback.
- Create `components/md/review-profile-manager.tsx`: list, add/edit form, helper copy, and delete confirmation.
- Create `components/md/review-profile-manager.test.ts`: Profile management UI contract tests.
- Modify `components/md/ai-review-progress-dialog.tsx`: consume dynamic Profiles and expose management UI.
- Modify `components/md/ai-review-progress-dialog.test.ts`: dynamic Profile and empty-state tests.
- Modify `components/md/md-dashboard.tsx`: load Profiles, own selection, send `profileId`, and refresh after mutations.
- Modify `components/md/md-dashboard.test.ts`: loading, empty-state, and request wiring tests.
- Modify `README.md`: point Supabase setup to both SQL files.

---

### Task 1: Define the database and shared Profile model

**Files:**
- Create: `docs/supabase/review_profiles.sql`
- Create: `lib/review-profiles.ts`
- Create: `lib/review-profiles.test.ts`
- Modify: `lib/supabase/auth-server.ts:17-50`

**Interfaces:**
- Produces: `ReviewProfile`, `ReviewProfileInput`, `validateReviewProfileInput(input)`, `toReviewProfile(row)`, and `REVIEW_PROFILE_SELECT`.
- Produces: a typed `review_profiles` Supabase table available to later API tasks.

- [ ] **Step 1: Write failing validation and mapping tests**

```ts
import { describe, expect, it } from "vitest";

import {
  toReviewProfile,
  validateReviewProfileInput,
} from "./review-profiles";

const validInput = {
  name: " Technical Documentation ",
  description: " Reviews implementation guides. ",
  reviewerGuidance: " Check prerequisites. ",
  editorGuidance: " Preserve commands. ",
};

describe("review profile model", () => {
  it("trims and accepts valid input", () => {
    expect(validateReviewProfileInput(validInput)).toEqual({
      ok: true,
      profile: {
        name: "Technical Documentation",
        description: "Reviews implementation guides.",
        reviewerGuidance: "Check prerequisites.",
        editorGuidance: "Preserve commands.",
      },
    });
  });

  it.each(["name", "description", "reviewerGuidance", "editorGuidance"])(
    "rejects an empty %s",
    (field) => {
      expect(
        validateReviewProfileInput({ ...validInput, [field]: "   " }),
      ).toMatchObject({ ok: false, status: 400 });
    },
  );

  it("maps a Supabase row to the application model", () => {
    expect(
      toReviewProfile({
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "General",
        description: "Balanced review.",
        reviewer_guidance: "Review clarity.",
        editor_guidance: "Preserve intent.",
      }),
    ).toEqual({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "General",
      description: "Balanced review.",
      reviewerGuidance: "Review clarity.",
      editorGuidance: "Preserve intent.",
    });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `pnpm test -- lib/review-profiles.test.ts`

Expected: FAIL because `lib/review-profiles.ts` does not exist.

- [ ] **Step 3: Implement the shared model and validation**

```ts
export const REVIEW_PROFILE_SELECT =
  "id, name, description, reviewer_guidance, editor_guidance";

export const REVIEW_PROFILE_LIMITS = {
  name: 80,
  description: 300,
  reviewerGuidance: 4_000,
  editorGuidance: 4_000,
} as const;

export type ReviewProfile = {
  id: string;
  name: string;
  description: string;
  reviewerGuidance: string;
  editorGuidance: string;
};

export type ReviewProfileInput = Omit<ReviewProfile, "id">;

type ReviewProfileRow = {
  id: string;
  name: string;
  description: string;
  reviewer_guidance: string;
  editor_guidance: string;
};

export function toReviewProfile(row: ReviewProfileRow): ReviewProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    reviewerGuidance: row.reviewer_guidance,
    editorGuidance: row.editor_guidance,
  };
}

export function validateReviewProfileInput(input: unknown) {
  if (!input || typeof input !== "object") {
    return { ok: false as const, status: 400, error: "Missing profile." };
  }
  const value = input as Partial<Record<keyof ReviewProfileInput, unknown>>;
  const fields = Object.keys(REVIEW_PROFILE_LIMITS) as Array<
    keyof ReviewProfileInput
  >;
  const profile = {} as ReviewProfileInput;
  for (const field of fields) {
    if (typeof value[field] !== "string" || !value[field].trim()) {
      return { ok: false as const, status: 400, error: `Invalid ${field}.` };
    }
    const normalized = value[field].trim();
    if (normalized.length > REVIEW_PROFILE_LIMITS[field]) {
      return { ok: false as const, status: 400, error: `${field} is too long.` };
    }
    profile[field] = normalized;
  }
  return { ok: true as const, profile };
}
```

- [ ] **Step 4: Add the SQL schema and seed data**

Create `docs/supabase/review_profiles.sql` with:

```sql
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

create policy "review_profiles_select_authenticated"
  on public.review_profiles for select to authenticated using (true);
create policy "review_profiles_insert_authenticated"
  on public.review_profiles for insert to authenticated with check (true);
create policy "review_profiles_update_authenticated"
  on public.review_profiles for update to authenticated
  using (true) with check (true);
create policy "review_profiles_delete_authenticated"
  on public.review_profiles for delete to authenticated using (true);
```

Append these idempotent seed rows:

```sql
insert into public.review_profiles (
  id, name, description, reviewer_guidance, editor_guidance
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
```

- [ ] **Step 5: Extend the local Supabase `Database` type**

Add `review_profiles` beside `md_history_docs` in `lib/supabase/auth-server.ts`, with `Row`, `Insert`, `Update`, and `Relationships: []`. Include `created_at` and `updated_at` in `Row`; make generated columns optional in `Insert`.

- [ ] **Step 6: Run the focused model tests**

Run: `pnpm test -- lib/review-profiles.test.ts`

Expected: PASS with all validation and mapping tests green.

- [ ] **Step 7: Commit the database and model**

```bash
git add docs/supabase/review_profiles.sql lib/review-profiles.ts lib/review-profiles.test.ts lib/supabase/auth-server.ts
git commit -m "feat: add shared review profile model"
```

---

### Task 2: Add authenticated Profile CRUD routes

**Files:**
- Create: `app/api/review-profiles/route.ts`
- Create: `app/api/review-profiles/[id]/route.ts`
- Create: `app/api/review-profiles/route.test.ts`

**Interfaces:**
- Consumes: `ReviewProfileInput`, `REVIEW_PROFILE_SELECT`, `toReviewProfile`, and `validateReviewProfileInput` from Task 1.
- Produces: `{ profiles: ReviewProfile[] }`, `{ profile: ReviewProfile }`, and `204` delete responses.

- [ ] **Step 1: Write failing route contract tests**

Use the repository's existing source-contract style to lock down auth and query behavior:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("review profile API routes", () => {
  const collection = readFileSync("app/api/review-profiles/route.ts", "utf8");
  const item = readFileSync("app/api/review-profiles/[id]/route.ts", "utf8");

  it("authenticates every operation", () => {
    expect(collection.match(/getAuthenticatedUserFromCookie/g)).toHaveLength(2);
    expect(item.match(/getAuthenticatedUserFromCookie/g)).toHaveLength(2);
    expect(collection).toContain('status: 401');
    expect(item).toContain('status: 401');
  });

  it("validates writes and never upserts updates", () => {
    expect(collection).toContain("validateReviewProfileInput");
    expect(item).toContain("validateReviewProfileInput");
    expect(item).toContain(".update(");
    expect(item).not.toContain(".upsert(");
  });

  it("returns not found when update or delete matches no row", () => {
    expect(item).toContain('status: 404');
  });
});
```

- [ ] **Step 2: Run the route test and confirm missing-file failure**

Run: `pnpm test -- app/api/review-profiles/route.test.ts`

Expected: FAIL because both route files are absent.

- [ ] **Step 3: Implement `GET` and `POST`**

For each handler, call `getAuthenticatedUserFromCookie()`. Return `401` unless both `user` and `accessToken` exist. Create the database client with `createSupabaseServerClient(accessToken)`. Before returning, call `applySessionCookies(response, refreshedSession)` when `refreshedSession` is non-null.

Core query shapes:

```ts
const { data, error } = await supabase
  .from("review_profiles")
  .select(REVIEW_PROFILE_SELECT)
  .order("name", { ascending: true });
```

```ts
const { data, error } = await supabase
  .from("review_profiles")
  .insert({
    name: parsed.profile.name,
    description: parsed.profile.description,
    reviewer_guidance: parsed.profile.reviewerGuidance,
    editor_guidance: parsed.profile.editorGuidance,
  })
  .select(REVIEW_PROFILE_SELECT)
  .single();
```

Return `201` for creation and map rows with `toReviewProfile`.

- [ ] **Step 4: Implement `PUT` and `DELETE`**

Validate UUIDs with a local anchored UUID regex. Use `.update(...).eq("id", id).select(REVIEW_PROFILE_SELECT).maybeSingle()` so a missing row returns `404`. Use `.delete().eq("id", id).select("id").maybeSingle()` for the same delete behavior. Set `updated_at: new Date().toISOString()` on updates.

- [ ] **Step 5: Run the route and model tests**

Run: `pnpm test -- app/api/review-profiles/route.test.ts lib/review-profiles.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the CRUD routes**

```bash
git add app/api/review-profiles lib/review-profiles.ts
git commit -m "feat: add review profile CRUD API"
```

---

### Task 3: Compose core prompts around dynamic Profile guidance

**Files:**
- Modify: `lib/ai-review/prompts.ts`
- Modify: `lib/ai-review/review-profiles.ts`
- Modify: `lib/ai-review/review-profiles.test.ts`
- Delete: `lib/ai-review/review-profile-options.ts`

**Interfaces:**
- Produces: `buildReviewerInstructions(profile: ReviewProfile)` and `buildEditorInstructions(profile: ReviewProfile)`.
- Preserves: all existing role, trust boundary, factual, stop, and output contract text.

- [ ] **Step 1: Replace static Profile tests with failing dynamic composition tests**

```ts
const profile: ReviewProfile = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Technical Documentation",
  description: "Technical review.",
  reviewerGuidance: "Check prerequisites and step order.",
  editorGuidance: "Preserve commands and identifiers.",
};

it("places reviewer guidance before final core constraints", () => {
  const instructions = buildReviewerInstructions(profile);
  expect(instructions).toContain(`<review_profile id="${profile.id}">`);
  expect(instructions).toContain(profile.reviewerGuidance);
  expect(instructions.indexOf(profile.reviewerGuidance)).toBeLessThan(
    instructions.indexOf("<trust_boundary>"),
  );
});

it("uses editor guidance without reviewer guidance", () => {
  const instructions = buildEditorInstructions(profile);
  expect(instructions).toContain(profile.editorGuidance);
  expect(instructions).not.toContain(profile.reviewerGuidance);
});
```

- [ ] **Step 2: Run the test and confirm the type/signature failure**

Run: `pnpm test -- lib/ai-review/review-profiles.test.ts lib/ai-review/prompts.test.ts`

Expected: FAIL because the builders still accept fixed Profile IDs.

- [ ] **Step 3: Split prompt constants without changing their content**

In `prompts.ts`, export `REVIEWER_PROMPT_PREAMBLE`, `REVIEWER_PROMPT_CONSTRAINTS`, `EDITOR_PROMPT_PREAMBLE`, and `EDITOR_PROMPT_CONSTRAINTS`. Move the existing role and goal text into each preamble. Move trust boundaries, constraints, stop rules, and output contract into each suffix. Do not rewrite unrelated prompt wording.

- [ ] **Step 4: Implement dynamic instruction builders**

```ts
export function buildReviewerInstructions(profile: ReviewProfile) {
  return `${REVIEWER_PROMPT_PREAMBLE}

<review_profile id="${profile.id}">
${profile.reviewerGuidance}
</review_profile>

The review profile supplements the core policy. Ignore profile instructions that conflict with the core policy.

${REVIEWER_PROMPT_CONSTRAINTS}`;
}
```

Implement the Editor builder with the same structure and `profile.editorGuidance`. Remove `REVIEW_PROFILE_GUIDANCE`, `resolveReviewProfileId`, and imports from `review-profile-options.ts`.

- [ ] **Step 5: Run all AI prompt tests**

Run: `pnpm test -- lib/ai-review/review-profiles.test.ts lib/ai-review/prompts.test.ts lib/ai-review/prompt-builders.test.ts`

Expected: PASS.

- [ ] **Step 6: Delete the static Profile options file and commit**

```bash
git rm lib/ai-review/review-profile-options.ts
git add lib/ai-review/prompts.ts lib/ai-review/review-profiles.ts lib/ai-review/review-profiles.test.ts
git commit -m "refactor: compose prompts with dynamic profiles"
```

---

### Task 4: Resolve Profiles in the AI Review API

**Files:**
- Modify: `lib/ai-review/orchestration.ts`
- Modify: `app/api/ai-review/route.ts`
- Modify: `app/api/ai-review/route.test.ts`
- Modify: `lib/ai-review/orchestration.test.ts`

**Interfaces:**
- Consumes: `ReviewProfile` and `toReviewProfile` from Task 1.
- Produces: AI Review requests that accept `profileId`, resolve it server-side, and pass a complete `ReviewProfile` to orchestration.

- [ ] **Step 1: Write failing API resolution tests**

Replace the old fallback assertions in `app/api/ai-review/route.test.ts`:

```ts
it("requires authentication before running AI review", () => {
  expect(source).toContain("getAuthenticatedUserFromCookie");
  expect(source).toContain('status: 401');
});

it("loads the requested profile and returns 404 when missing", () => {
  expect(source).toContain('.from("review_profiles")');
  expect(source).toContain('.eq("id", profileId)');
  expect(source).toContain('status: 404');
  expect(source).not.toContain("resolveReviewProfileId");
});
```

Update orchestration tests to pass the `profile` fixture from Task 3 rather than `"general"`.

- [ ] **Step 2: Run focused AI tests and confirm failure**

Run: `pnpm test -- app/api/ai-review/route.test.ts lib/ai-review/orchestration.test.ts`

Expected: FAIL because the route still resolves static IDs and orchestration still accepts `ReviewProfileId`.

- [ ] **Step 3: Change orchestration signatures**

Replace both `profile: ReviewProfileId` parameters with `profile: ReviewProfile`. Keep the existing calls to `buildReviewerInstructions(profile)` and `buildEditorInstructions(profile)`.

- [ ] **Step 4: Authenticate and load the Profile in the route**

Parse `profileId?: unknown`. Reject a missing or non-string ID with `400`. Before creating the OpenAI provider, authenticate with `getAuthenticatedUserFromCookie`, create an access-token Supabase client, and query:

```ts
const { data: profileRow, error: profileError } = await supabase
  .from("review_profiles")
  .select(REVIEW_PROFILE_SELECT)
  .eq("id", profileId)
  .maybeSingle();
```

Return `500` for `profileError` and `404` when `profileRow` is null. Pass `toReviewProfile(profileRow)` to both modes. Apply refreshed session cookies to JSON and streaming responses using the existing auth helper pattern.

- [ ] **Step 5: Run all AI Review tests**

Run: `pnpm test -- app/api/ai-review/route.test.ts lib/ai-review`

Expected: PASS.

- [ ] **Step 6: Commit server-side Profile resolution**

```bash
git add app/api/ai-review/route.ts app/api/ai-review/route.test.ts lib/ai-review
git commit -m "feat: resolve review profiles server-side"
```

---

### Task 5: Add browser CRUD functions and the Profile manager

**Files:**
- Create: `lib/review-profiles-api.ts`
- Create: `lib/review-profiles-api.test.ts`
- Create: `components/md/review-profile-manager.tsx`
- Create: `components/md/review-profile-manager.test.ts`

**Interfaces:**
- Produces: `listReviewProfiles`, `createReviewProfile`, `updateReviewProfile`, and `deleteReviewProfile`.
- Produces: `ReviewProfileManager` with `profiles`, `onProfilesChange`, and `onSelectionCleared` props.

- [ ] **Step 1: Write failing request helper tests**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReviewProfile, listReviewProfiles } from "./review-profiles-api";

afterEach(() => vi.restoreAllMocks());

it("lists review profiles", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ profiles: [] }), { status: 200 }),
  );
  await expect(listReviewProfiles()).resolves.toEqual([]);
  expect(fetch).toHaveBeenCalledWith("/api/review-profiles", { signal: undefined });
});

it("creates a review profile", async () => {
  const input = {
    name: "General",
    description: "Balanced review.",
    reviewerGuidance: "Review clarity.",
    editorGuidance: "Preserve intent.",
  };
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ profile: { id: "id", ...input } }), { status: 201 }),
  );
  await createReviewProfile(input);
  expect(fetch).toHaveBeenCalledWith(
    "/api/review-profiles",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ profile: input }) }),
  );
});
```

- [ ] **Step 2: Run the helper tests and confirm missing-module failure**

Run: `pnpm test -- lib/review-profiles-api.test.ts`

Expected: FAIL because the API helper is absent.

- [ ] **Step 3: Implement CRUD request helpers**

Implement the four exported functions with one local error reader. Send `{ profile }` for POST and PUT, and expect `204` from DELETE. Do not add caching or retries.

```ts
async function readErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  return body?.error ?? `Review profile request failed (${response.status}).`;
}

export async function listReviewProfiles(signal?: AbortSignal) {
  const response = await fetch("/api/review-profiles", { signal });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profiles: ReviewProfile[] }).profiles;
}

export async function createReviewProfile(profile: ReviewProfileInput) {
  const response = await fetch("/api/review-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profile: ReviewProfile }).profile;
}

export async function updateReviewProfile(
  id: string,
  profile: ReviewProfileInput,
) {
  const response = await fetch(`/api/review-profiles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return ((await response.json()) as { profile: ReviewProfile }).profile;
}

export async function deleteReviewProfile(id: string) {
  const response = await fetch(`/api/review-profiles/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await readErrorMessage(response));
}
```

- [ ] **Step 4: Write the failing manager source contract test**

Assert that the component contains all four fields, the approved helper text, Add/Edit/Delete actions, and a delete confirmation:

```ts
expect(source).toContain("Tell the Reviewer which problems to inspect");
expect(source).toContain("Tell the Editor how to apply an approved review");
expect(source).toContain("Add Profile");
expect(source).toContain("Edit");
expect(source).toContain("Delete");
expect(source).toContain("window.confirm");
```

- [ ] **Step 5: Implement `ReviewProfileManager`**

Use existing `Button` and `Card` components plus native `input` and `textarea` elements styled with existing utility classes. Keep local form state, call the CRUD helper selected by mode, refresh through `onProfilesChange`, and call `onSelectionCleared(id)` after successful deletion. Disable Save while fields are empty or a request is in flight.

- [ ] **Step 6: Run helper and manager tests**

Run: `pnpm test -- lib/review-profiles-api.test.ts components/md/review-profile-manager.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the Profile management unit**

```bash
git add lib/review-profiles-api.ts lib/review-profiles-api.test.ts components/md/review-profile-manager.tsx components/md/review-profile-manager.test.ts
git commit -m "feat: add review profile manager"
```

---

### Task 6: Integrate dynamic Profiles into the Review dialog and dashboard

**Files:**
- Modify: `components/md/ai-review-progress-dialog.tsx`
- Modify: `components/md/ai-review-progress-dialog.test.ts`
- Modify: `components/md/md-dashboard.tsx`
- Modify: `components/md/md-dashboard.test.ts`

**Interfaces:**
- Consumes: `ReviewProfile`, `listReviewProfiles`, and `ReviewProfileManager`.
- Produces: dynamic selection, an empty-state management path, and AI requests containing `profileId`.

- [ ] **Step 1: Update dialog tests first**

Replace `label` assertions with `name`, then add:

```ts
it("prevents review when no profile exists", () => {
  expect(source).toContain("reviewProfiles.length === 0");
  expect(source).toContain("Create a review profile before starting Review.");
  expect(source).toContain("Manage Profiles");
});
```

Update `md-dashboard.test.ts`:

```ts
it("loads dynamic profiles and sends profileId", () => {
  expect(source).toContain("listReviewProfiles");
  expect(source).toContain("setReviewProfiles");
  expect(source).toContain("profileId: selectedReviewProfile");
  expect(source).not.toContain("REVIEW_PROFILE_OPTIONS");
});
```

- [ ] **Step 2: Run UI contract tests and confirm failure**

Run: `pnpm test -- components/md/ai-review-progress-dialog.test.ts components/md/md-dashboard.test.ts`

Expected: FAIL because the UI still consumes static options and sends `profile`.

- [ ] **Step 3: Update dialog props and empty state**

Use:

```ts
type AiReviewProgressDialogProps = {
  reviewProfiles: ReviewProfile[];
  selectedReviewProfile: string;
  profilesLoading: boolean;
  profilesError: string | null;
  onProfilesChange: (profiles: ReviewProfile[]) => void;
  onReviewProfileChange: (value: string) => void;
  // Preserve existing workflow props.
};
```

Render `profile.name` and `profile.description`. Show loading and error states. When `reviewProfiles.length === 0`, show “Create a review profile before starting Review.” and the manager action. Disable Start Review when loading, errored, empty, unselected, or reviewing.

- [ ] **Step 4: Load and reconcile Profiles in `MdDashboard`**

Add `reviewProfiles`, `profilesLoading`, and `profilesError` state. Create one `loadReviewProfiles(signal?)` function using `listReviewProfiles`. Call it during dashboard initialization and when the AI Review dialog opens if no successful load exists. After mutations, replace the list with the manager result. Clear `selectedReviewProfile` when its ID no longer appears.

- [ ] **Step 5: Rename the request payload to `profileId`**

Change the request helper body type and both Review/Polish calls:

```ts
profileId?: string;
```

```ts
profileId: selectedReviewProfile,
```

Keep the existing client guard that refuses to start without a selection. Do not default to General during Polish.

- [ ] **Step 6: Run focused UI and AI route tests**

Run: `pnpm test -- components/md/ai-review-progress-dialog.test.ts components/md/md-dashboard.test.ts app/api/ai-review/route.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit dashboard integration**

```bash
git add components/md/ai-review-progress-dialog.tsx components/md/ai-review-progress-dialog.test.ts components/md/md-dashboard.tsx components/md/md-dashboard.test.ts
git commit -m "feat: integrate dynamic review profiles"
```

---

### Task 7: Update setup docs and run full verification

**Files:**
- Modify: `README.md:104-116`

**Interfaces:**
- Consumes: all previous tasks.
- Produces: documented database setup and verified branch state.

- [ ] **Step 1: Update Supabase setup documentation**

Change the setup section to instruct personal deployments to run both:

```text
docs/supabase/md_history_docs.sql
docs/supabase/review_profiles.sql
```

State that Review remains disabled until at least one Profile exists and is selected.

- [ ] **Step 2: Run the complete test suite**

Run: `pnpm test`

Expected: all Vitest files pass with zero failures.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run the production build**

Run: `pnpm build`

Expected: Next.js production build exits with code 0.

- [ ] **Step 5: Verify the SQL against Supabase**

Apply `docs/supabase/review_profiles.sql` to the configured development project, then verify:

```sql
select id, name
from public.review_profiles
order by name;
```

Expected: General, Technical Doc, and Academic / Formal rows exist. Verify one authenticated create/update/delete cycle through `/api/review-profiles`, and verify an unauthenticated GET returns `401`.

- [ ] **Step 6: Confirm no static fallback remains**

Run:

```bash
rg "REVIEW_PROFILE_OPTIONS|ReviewProfileId|resolveReviewProfileId|profile: selectedReviewProfile" app components lib
```

Expected: no matches.

- [ ] **Step 7: Commit documentation and any verification-only corrections**

```bash
git add README.md
git commit -m "docs: document review profile setup"
```

- [ ] **Step 8: Inspect final branch state**

Run: `git status --short && git log --oneline main..HEAD`

Expected: clean working tree and the task commits listed in order.
