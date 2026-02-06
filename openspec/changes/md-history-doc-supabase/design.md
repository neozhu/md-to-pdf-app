## Context

The app currently provides a Markdown history list (sidebar/drawer) backed by dummy/in-memory state:

- `MdHistoryDoc` is a client-side type (`components/md/use-md-history.ts`) with fields `{ id, mdFileName, markdown, updatedAt }` where `updatedAt` is an epoch-ms number.
- `useMdHistory()` manages the list and only writes history snapshots on **New**, **switch**, and **delete** (export/print does not write).
- Initial history docs come from `createDummyHistoryDocs()` in `components/md/md-workbench.tsx` and `components/md/md-dashboard.tsx`.

The change introduces Supabase as durable storage for `MdHistoryDoc`, without adding login/auth. This means persistence can be global/permissive for now, with security tightening deferred.

## Goals / Non-Goals

**Goals:**

- Persist `MdHistoryDoc` records to Supabase (CRUD) and load them on app startup.
- Preserve existing behavior rules (writes only on New / switch / delete; export does not write; delete active doc selects next).
- Keep client UI changes minimal (history UI stays the same; add loading/error handling where needed).
- Avoid storing secrets in the browser (prefer server-side Supabase access).

**Non-Goals:**

- User login, authentication, or per-user authorization.
- Conflict resolution beyond “last write wins” semantics (multi-tab / multi-device).
- Offline-first sync, background autosave while typing, or continuous debounced writes.
- Encryption or data privacy guarantees (out of scope given no auth).

## Decisions

### 1) Data model: single table for `MdHistoryDoc`

Create a single Supabase table (e.g., `md_history_docs`) representing `MdHistoryDoc`.

Proposed columns:

- `id` (uuid or text) primary key
- `md_file_name` (text, not null)
- `markdown` (text, not null)
- `updated_at_ms` (bigint, not null) — matches existing `updatedAt` (epoch ms)
- `created_at` (timestamptz, default `now()`)

Indexes:

- `updated_at_ms` descending (for “most recent first” queries)

Rationale:

- Aligning with the current in-app model minimizes conversion logic.
- Using `updated_at_ms` avoids timezone/date parsing and keeps ordering consistent with existing UI logic.

Alternatives considered:

- Use `updated_at` as `timestamptz`: more idiomatic SQL, but requires converting ms ↔ timestamps consistently across client/server and risks subtle ordering differences.
- Split content vs metadata tables: unnecessary complexity for the current scope.

### 2) Server-mediated persistence via Next.js route handlers

Implement a small server API surface (Next.js Route Handlers) to access Supabase:

- `GET /api/md-history` → list docs ordered by `updated_at_ms desc`
- `POST /api/md-history` → create a new doc
- `PUT /api/md-history/:id` → update (md_file_name/markdown/updated_at_ms)
- `DELETE /api/md-history/:id` → delete

Rationale:

- Keeps Supabase secret keys server-side (browser only talks to this app).
- Central place for validation, shaping data, and future auth/rate-limiting.
- Avoids tying UI code directly to Supabase SDK details.

Alternatives considered:

- Direct browser-to-Supabase using a publishable key: simplest, but exposes an open database surface and makes it harder to evolve toward auth later without refactoring.
- Server Actions: possible, but route handlers are clearer for CRUD + future external clients and better align with a REST-ish persistence layer.

### 3) No auth: explicitly permissive access, with guardrails as “future hardening”

Given “don’t consider login/auth”:

- The API endpoints will not require end-user identity.
- Supabase RLS/policies can be permissive for this table (or server can use a service role key and keep RLS decisions isolated to the server).

Rationale:

- Matches the requested scope and unblocks durable storage quickly.

Trade-off:

- Anyone who can reach the app can read/modify/delete the shared history.

### 4) Client integration: keep `useMdHistory()` as the local source of truth + optimistic server sync

Approach:

- Keep `useMdHistory()` largely responsible for local behavior rules and ordering.
- Add a thin persistence layer used by the workbench/dashboard:
  - On mount: load docs from `GET /api/md-history`, then hydrate local state.
  - On New / switch: perform the same “save active if changed” behavior, then issue `POST`/`PUT` calls accordingly.
  - On delete: optimistically remove locally and issue `DELETE`.

Rationale:

- Minimizes risk of regressions in history behavior (the current rules are already encoded in `useMdHistory()`).
- Only introduces network writes on the same events that already create history writes (New/switch/delete), so there’s no need for debounced typing autosave.

Alternatives considered:

- Move all logic server-side and treat client as a thin view: bigger refactor, less leverage of existing behavior rules.
- Add continuous autosave while typing: not required and increases load/complexity without clear UX mandate.

## Risks / Trade-offs

- **[Public, shared data]** Anyone can read/modify history → Mitigation: keep Supabase secrets server-side; add rate limiting and auth in a follow-up; consider a lightweight “namespace key” concept later.
- **[Multi-tab overwrite]** Two sessions can update the same doc → Mitigation: accept last-write-wins; optionally add conditional updates (e.g., compare `updated_at_ms`) later.
- **[Large markdown payloads]** Very large docs can cause slow requests/DB bloat → Mitigation: set practical limits (server-side validation), and consider compression or file storage later.
- **[Startup latency]** Fetching history adds load time → Mitigation: show skeleton/loader in the history panel and keep editor usable with an initial empty doc until hydration completes.

## Migration Plan

1. Create the Supabase table and index (SQL migration executed in Supabase).
2. Add required env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (if needed for any client initialization)
   - Server-only secret key (e.g., `SUPABASE_SERVICE_ROLE_KEY`) for route handlers
3. Deploy app with the new API routes.
4. Rollback strategy: revert UI to `createDummyHistoryDocs()` if Supabase is unavailable or misconfigured.

## Open Questions

- Should history be globally shared (current implication) or scoped to an anonymous “installation id” stored in localStorage? The latter reduces cross-user interference without “auth”, but prevents true cross-device continuity unless users manually transfer the id.
- Should `id` be generated client-side (current behavior) or server-side (DB-generated UUID)? Client-side avoids waiting for `POST` response to switch, but server-side simplifies integrity.
