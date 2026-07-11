import { NextResponse } from "next/server";

import {
  REVIEW_PROFILE_SELECT,
  toReviewProfile,
  validateReviewProfileInput,
} from "@/lib/review-profiles";
import {
  applySessionCookies,
  createSupabaseServerClient,
  getAuthenticatedUserFromCookie,
} from "@/lib/supabase/auth-server";

export const runtime = "nodejs";

function withRefreshedSessionCookie(
  response: NextResponse,
  refreshedSession: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  } | null,
) {
  if (refreshedSession) {
    applySessionCookies(response, refreshedSession);
  }
  return response;
}

export async function GET() {
  try {
    const { user, accessToken, refreshedSession } =
      await getAuthenticatedUserFromCookie();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServerClient(accessToken);
    const { data, error } = await supabase
      .from("review_profiles")
      .select(REVIEW_PROFILE_SELECT)
      .order("name", { ascending: true });

    if (error) {
      console.error("[api/review-profiles] List failed:", error);
      return NextResponse.json(
        { error: "Failed to load review profiles." },
        { status: 500 },
      );
    }

    return withRefreshedSessionCookie(
      NextResponse.json({ profiles: (data ?? []).map(toReviewProfile) }),
      refreshedSession,
    );
  } catch (error) {
    console.error("[api/review-profiles] List failed:", error);
    return NextResponse.json(
      { error: "Failed to load review profiles." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = validateReviewProfileInput(
      (body as { profile?: unknown } | null)?.profile,
    );
    if (!parsed.ok) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }

    const { user, accessToken, refreshedSession } =
      await getAuthenticatedUserFromCookie();
    if (!user || !accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createSupabaseServerClient(accessToken);
    const { data, error } = await supabase
      .from("review_profiles")
      .insert({
        name: parsed.profile.name,
        description: parsed.profile.description,
        reviewer_guidance: parsed.profile.reviewerGuidance,
        editor_guidance: parsed.profile.editorGuidance,
      })
      .select(REVIEW_PROFILE_SELECT)
      .single();

    if (error) {
      console.error("[api/review-profiles] Create failed:", error);
      return NextResponse.json(
        { error: "Failed to create review profile." },
        { status: 500 },
      );
    }

    return withRefreshedSessionCookie(
      NextResponse.json(
        { profile: toReviewProfile(data) },
        { status: 201 },
      ),
      refreshedSession,
    );
  } catch (error) {
    console.error("[api/review-profiles] Create failed:", error);
    return NextResponse.json(
      { error: "Failed to create review profile." },
      { status: 500 },
    );
  }
}
