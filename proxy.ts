import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  applySessionCookies,
  clearSessionCookies,
} from "@/lib/supabase/auth-server";

const LOGIN_PATH = "/login";
const HOME_PATH = "/";

function isHistoryApiPath(pathname: string) {
  return pathname === "/api/md-history" || pathname.startsWith("/api/md-history/");
}

function withPendingCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
  return target;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const response = NextResponse.next({ request });
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
  let userId: string | null = null;

  if (accessToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "",
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(accessToken);
    if (!error && user) {
      userId = user.id;
    }
  }

  if (!userId && refreshToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? "",
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });
    const refreshedSession = data.session;
    const refreshedUser = data.user;

    if (!error && refreshedSession && refreshedUser) {
      userId = refreshedUser.id;
      applySessionCookies(response, refreshedSession);
    } else {
      clearSessionCookies(response);
    }
  }

  if (!userId && isHistoryApiPath(pathname)) {
    return withPendingCookies(
      response,
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  if (!userId && pathname === HOME_PATH) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return withPendingCookies(response, NextResponse.redirect(loginUrl));
  }

  if (userId && pathname === LOGIN_PATH) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = HOME_PATH;
    homeUrl.search = "";
    return withPendingCookies(response, NextResponse.redirect(homeUrl));
  }

  return response;
}

export const config = {
  matcher: ["/", "/login", "/api/md-history/:path*"],
};
