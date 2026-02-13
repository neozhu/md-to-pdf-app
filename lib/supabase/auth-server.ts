import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

export const ACCESS_TOKEN_COOKIE = "sb-access-token";
export const REFRESH_TOKEN_COOKIE = "sb-refresh-token";
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type AuthCookieSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type Database = {
  public: {
    Tables: {
      md_history_docs: {
        Row: {
          id: string;
          user_id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Insert: {
          id: string;
          user_id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          md_file_name?: string;
          markdown?: string;
          updated_at_ms?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function createSupabaseServerClient(accessToken?: string) {
  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      : undefined,
  });
}

function normalizeAuthCookieSession(session: {
  access_token?: string | null;
  refresh_token?: string | null;
  expires_in?: number | null;
} | null): AuthCookieSession | null {
  const accessToken = session?.access_token ?? null;
  const refreshToken = session?.refresh_token ?? null;
  if (!accessToken || !refreshToken) {
    return null;
  }

  const expiresIn = Number(session?.expires_in);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
  };
}

export function applySessionCookies(res: NextResponse, session: AuthCookieSession) {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = Number.isFinite(session.expires_in) ? session.expires_in : 3600;

  res.cookies.set(ACCESS_TOKEN_COOKIE, session.access_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, session.refresh_token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookies(res: NextResponse) {
  const isProd = process.env.NODE_ENV === "production";

  res.cookies.set(ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(REFRESH_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getAuthenticatedUserFromCookie(): Promise<{
  user: User | null;
  accessToken: string | null;
  refreshedSession: AuthCookieSession | null;
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const refreshToken = cookieStore.get(REFRESH_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken && !refreshToken) {
    return { user: null, accessToken: null, refreshedSession: null };
  }

  const supabase = createSupabaseServerClient();

  if (accessToken) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);
    if (!error && user) {
      return { user, accessToken, refreshedSession: null };
    }
  }

  if (!refreshToken) {
    return { user: null, accessToken: null, refreshedSession: null };
  }

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });
  const refreshedSession = normalizeAuthCookieSession(data.session);
  const refreshedUser = data.user;

  if (error || !refreshedSession || !refreshedUser) {
    return { user: null, accessToken: null, refreshedSession: null };
  }

  return {
    user: refreshedUser,
    accessToken: refreshedSession.access_token,
    refreshedSession,
  };
}
