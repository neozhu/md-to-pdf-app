import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearSessionCookies } from "@/lib/supabase/auth-server";
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

describe("proxy auth transport failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed without clearing cookies when Supabase closes the socket", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(createClient).mockReturnValue({
      auth: {
        getUser: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
        refreshSession: vi.fn().mockRejectedValue(new TypeError("fetch failed")),
      },
    } as unknown as ReturnType<typeof createClient>);
    const request = new NextRequest("http://localhost/", {
      headers: {
        cookie: "md_access_token=access; md_refresh_token=refresh",
      },
    });

    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2F");
    expect(clearSessionCookies).not.toHaveBeenCalled();
  });
});
