import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getSupabasePublishableKey, getSupabaseUrl } from "./env";

export const ACCESS_TOKEN_COOKIE = "sb-access-token";
export const REFRESH_TOKEN_COOKIE = "sb-refresh-token";

type Database = {
  public: {
    Tables: {
      md_history_docs: {
        Row: {
          id: string;
          user_id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Insert: {
          id: string;
          user_id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          md_file_name?: string;
          markdown?: string;
          updated_at_ms?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function createSupabaseServerClient(accessToken?: string) {
  return createClient<Database>(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      : undefined,
  });
}

export async function getAuthenticatedUserFromCookie(): Promise<{
  user: User | null;
  accessToken: string | null;
}> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  if (!accessToken) {
    return { user: null, accessToken: null };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return { user: null, accessToken: null };
  }

  return { user, accessToken };
}
