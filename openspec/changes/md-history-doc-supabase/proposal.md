## Why

The MD history sidebar/drawer is currently backed by dummy/in-memory data, so users lose history on refresh and can’t share the same history across devices. Persisting `MdHistoryDoc` to Supabase enables durable history storage now, and sets a foundation for future multi-user/history features later (auth explicitly out of scope for this change).

## What Changes

- Add Supabase-backed persistence for `MdHistoryDoc` records (create, list, update, delete).
- Load history documents from Supabase on app startup instead of `createDummyHistoryDocs()`.
- Ensure the existing history behavior rules remain the same (writes happen on New / switch / delete; export does not write).
- Add project configuration for Supabase (env vars) and a minimal database schema for storing documents.

## Capabilities

### New Capabilities

- `md-history-doc-supabase-storage`: Store and retrieve `MdHistoryDoc` from Supabase, including ordering by `updatedAt` and CRUD operations.

### Modified Capabilities

<!-- None (no existing specs in openspec/specs/ at time of proposal). -->

## Impact

- **Frontend**: `useMdHistory()` usage in `components/md/md-workbench.tsx` and `components/md/md-dashboard.tsx` will switch from dummy initial docs to Supabase-loaded docs.
- **Backend/API**: Add a small server-side interface (route handlers or server actions) that performs Supabase CRUD without requiring end-user auth.
- **Dependencies**: Add Supabase client library and supporting utilities.
- **Configuration/Deployment**: Add/update `.env` and Docker deployment guidance for Supabase URL/keys.
- **Security posture**: Because login/auth is out of scope, data access will be intentionally permissive; tightening access control is a future follow-up.
