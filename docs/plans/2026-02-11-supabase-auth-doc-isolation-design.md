# Supabase Auth + User-Scoped History Isolation

## Goal

Implement email/password login and isolate history documents by authenticated user.  
Only logged-in users can access the main app, and each user can read/write/delete only their own history records.

## Product Decisions

- Login method: email/password.
- Isolation key: `auth.users.id`.
- Access model: app root (`/`) requires login.
- Legacy anonymous history: ignored; users start with empty history.
- Login entry: dedicated `/login` page.
- Next.js 16 edge guard file: `proxy.ts` (not `middleware.ts`).

## Architecture

1. **Session layer**
   - Client submits credentials to `POST /api/auth/session`.
   - Server authenticates with Supabase and writes HttpOnly cookies:
     - `sb-access-token`
     - `sb-refresh-token`
   - Logout endpoint clears these cookies: `POST /api/auth/logout`.

2. **Route/API guard**
   - `proxy.ts` checks `sb-access-token` with `supabase.auth.getUser(token)`.
   - Unauthenticated:
     - `/` -> redirect to `/login`
     - `/api/md-history*` -> `401`
   - Authenticated:
     - `/login` -> redirect to `/`

3. **Data isolation**
   - `md_history_docs` schema adds `user_id uuid references auth.users(id)`.
   - RLS enabled with `auth.uid() = user_id` policies for select/insert/update/delete.
   - API writes `user_id` from authenticated server user only.

## API/Frontend Changes

- Add auth routes:
  - `app/api/auth/session/route.ts`
  - `app/api/auth/logout/route.ts`
- Add login page:
  - `app/login/page.tsx`
  - `components/auth/login-form.tsx`
- Update history routes to require authenticated cookie user and use user-bound writes.
- Update frontend history API to redirect to `/login` on `401`.
- Add sign-out button in dashboard header.

## Security Notes

- Identity for data ownership is always derived server-side from session token.
- Client payload cannot choose `user_id`.
- RLS remains the last-line guard against accidental API filtering mistakes.

## Verification

- `pnpm -s exec tsc --noEmit`
- `pnpm -s lint`
