## 1. Supabase setup & schema

- [x] 1.1 Decide table name/columns and write Supabase SQL for `md_history_docs` (id, md_file_name, markdown, updated_at_ms, created_at) + index on `updated_at_ms`
- [ ] 1.2 Apply the SQL in Supabase and confirm CRUD works via Supabase dashboard/API
- [x] 1.3 Add/confirm environment variables for Supabase URL + server key (and document them in `.env.local.sample` / README)

## 2. Server persistence layer (API)

- [x] 2.1 Add Supabase server client helper that reads server-side env vars and fails with a clear error when misconfigured
- [x] 2.2 Implement `GET /api/md-history` returning `{ docs: MdHistoryDoc[] }` ordered by `updatedAt` desc
- [x] 2.3 Implement `POST /api/md-history` accepting `{ doc: MdHistoryDoc }` and returning `201` with `{ doc }`
- [x] 2.4 Implement `PUT /api/md-history/:id` accepting `{ doc: MdHistoryDoc }` and returning `200` with `{ doc }` (overwrite, last write wins)
- [x] 2.5 Implement `DELETE /api/md-history/:id` returning `204`
- [x] 2.6 Add input validation (required fields + types) and consistent JSON error responses for non-2xx cases

## 3. Client integration (hydrate + write triggers)

- [x] 3.1 Replace `createDummyHistoryDocs()` initialization in `components/md/md-workbench.tsx` with a “hydration” flow that loads from `GET /api/md-history`
- [x] 3.2 Ensure initial UI state behaves when the list is empty (create a local empty doc) while still allowing later hydration to replace docs
- [x] 3.3 On “New”: call persistence create for the newly created doc and persistence update for the previously-active doc when it changed
- [x] 3.4 On “Switch”: call persistence update for the previously-active doc when it changed (and do not create duplicates)
- [x] 3.5 On “Delete”: call persistence delete; if deleting active doc, keep existing “select next / create empty” behavior
- [x] 3.6 Confirm “Download PDF” / “Print” do not call persistence APIs

## 4. UX, reliability, and edge cases

- [x] 4.1 Add loading and error UI for history hydration (non-blocking editor, clear messaging in history area)
- [x] 4.2 Handle network failures gracefully (optimistic UI with toasts; revert or retry guidance)
- [x] 4.3 Add a small payload size limit / guardrail for `markdown` to avoid pathological requests

## 5. Docs & verification

- [x] 5.1 Update README / deployment docs with Supabase setup steps (table SQL + env vars)
- [ ] 5.2 Manually verify end-to-end flows: list, new, switch, delete, refresh persistence, export/print no-write
