import { NextResponse } from "next/server";

import { clearSessionCookies } from "@/lib/supabase/auth-server";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearSessionCookies(res);
  return res;
}
