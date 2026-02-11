import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/auth-server";

type ResetPasswordRequest = {
  accessToken?: string;
  refreshToken?: string;
  password?: string;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ResetPasswordRequest | null;
    const accessToken = body?.accessToken?.trim();
    const refreshToken = body?.refreshToken?.trim();
    const password = body?.password;

    if (!accessToken || !refreshToken || !password) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (sessionError) {
      return NextResponse.json({ error: sessionError.message }, { status: 401 });
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
