import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/auth-server";

type ForgotPasswordRequest = {
  email?: string;
};

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as ForgotPasswordRequest | null;
    const email = body?.email?.trim();

    if (!email) {
      return NextResponse.json({ error: "Missing email." }, { status: 400 });
    }

    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";
    const redirectTo = `${origin}/reset-password`;

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
