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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid review profile id." },
        { status: 400 },
      );
    }

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
      .update({
        name: parsed.profile.name,
        description: parsed.profile.description,
        reviewer_guidance: parsed.profile.reviewerGuidance,
        editor_guidance: parsed.profile.editorGuidance,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(REVIEW_PROFILE_SELECT)
      .maybeSingle();

    if (error) {
      console.error("[api/review-profiles] Update failed:", error);
      return NextResponse.json(
        { error: "Failed to update review profile." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Review profile not found." },
        { status: 404 },
      );
    }

    return withRefreshedSessionCookie(
      NextResponse.json({ profile: toReviewProfile(data) }),
      refreshedSession,
    );
  } catch (error) {
    console.error("[api/review-profiles] Update failed:", error);
    return NextResponse.json(
      { error: "Failed to update review profile." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { error: "Invalid review profile id." },
        { status: 400 },
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
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      console.error("[api/review-profiles] Delete failed:", error);
      return NextResponse.json(
        { error: "Failed to delete review profile." },
        { status: 500 },
      );
    }
    if (!data) {
      return NextResponse.json(
        { error: "Review profile not found." },
        { status: 404 },
      );
    }

    return withRefreshedSessionCookie(
      new NextResponse(null, { status: 204 }),
      refreshedSession,
    );
  } catch (error) {
    console.error("[api/review-profiles] Delete failed:", error);
    return NextResponse.json(
      { error: "Failed to delete review profile." },
      { status: 500 },
    );
  }
}
