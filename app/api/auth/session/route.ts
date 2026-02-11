import { NextResponse } from "next/server";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  createSupabaseServerClient,
} from "@/lib/supabase/auth-server";

type SessionRequest = {
  email?: string;
  password?: string;
  mode?: "signin" | "signup";
};

export const runtime = "nodejs";

function applySessionCookies(
  res: NextResponse,
  session: { access_token: string; refresh_token: string; expires_in: number },
) {
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
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as SessionRequest | null;
    const email = body?.email?.trim();
    const password = body?.password;
    const mode = body?.mode ?? "signin";

    if (!email || !password) {
      return NextResponse.json({ error: "Missing email or password." }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const authResult =
      mode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (authResult.error) {
      return NextResponse.json({ error: authResult.error.message }, { status: 401 });
    }

    if (!authResult.data.session) {
      return NextResponse.json({
        ok: true,
        needsEmailConfirmation: true,
        message: "Account created. Please confirm your email before signing in.",
      });
    }

    const res = NextResponse.json({ ok: true });
    applySessionCookies(res, authResult.data.session);
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
