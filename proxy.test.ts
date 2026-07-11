import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "./proxy";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/auth-server", () => ({
  ACCESS_TOKEN_COOKIE: "md_access_token",
  REFRESH_TOKEN_COOKIE: "md_refresh_token",
  applySessionCookies: vi.fn(),
  clearSessionCookies: vi.fn(),
}));

describe("proxy auth verification", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses verified JWT claims as the authenticated user identity", async () => {
    const getClaims = vi.fn().mockResolvedValue({
      data: { claims: { sub: "user-1" } },
      error: null,
    });
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getClaims,
        refreshSession: vi.fn(),
      },
    } as unknown as ReturnType<typeof createClient>);
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: "md_access_token=access",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(getClaims).toHaveBeenCalledWith("access");
  });
});
