import { NextResponse } from "next/server";

import {
  applySessionCookies,
  createSupabaseServerClient,
} from "@/lib/supabase/auth-server";

type SessionRequest = {
  email?: string;
  password?: string;
  mode?: "signin" | "signup";
};

export const runtime = "nodejs";

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
