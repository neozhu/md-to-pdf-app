import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  getAuthenticatedUserFromCookie,
} from "./auth-server";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

function mockAuthCookies() {
  vi.mocked(cookies).mockResolvedValue({
    get(name: string) {
      if (name === ACCESS_TOKEN_COOKIE) return { value: "access" };
      if (name === REFRESH_TOKEN_COOKIE) return { value: "refresh" };
      return undefined;
    },
  } as Awaited<ReturnType<typeof cookies>>);
}

describe("getAuthenticatedUserFromCookie", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY", "publishable");
    mockAuthCookies();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns the verified claims subject without fetching the user record", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    const refreshSession = vi.fn();
    vi.mocked(createClient).mockReturnValue({
      auth: { getClaims, refreshSession },
    } as unknown as ReturnType<typeof createClient>);

    await expect(getAuthenticatedUserFromCookie()).resolves.toEqual({
      user: { id: "user-1" },
      accessToken: "access",
      refreshedSession: null,
    });
    expect(getClaims).toHaveBeenCalledWith("access");
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("keeps the existing refresh flow when claims verification fails", async () => {
    const refreshedUser = { id: "user-1" } as User;
    const refreshedSession = {
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 3600,
    };
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getClaims: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("invalid JWT"),
        }),
        refreshSession: vi.fn().mockResolvedValue({
          data: { user: refreshedUser, session: refreshedSession },
          error: null,
        }),
      },
    } as unknown as ReturnType<typeof createClient>);

    await expect(getAuthenticatedUserFromCookie()).resolves.toEqual({
      user: refreshedUser,
      accessToken: "new-access",
      refreshedSession,
    });
  });
});
