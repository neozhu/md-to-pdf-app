import { createClient } from "@supabase/supabase-js";

type Database = {
  public: {
    Tables: {
      md_history_docs: {
        Row: {
          id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Insert: {
          id: string;
          md_file_name: string;
          markdown: string;
          updated_at_ms: number;
        };
        Update: {
          id?: string;
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

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let cached:
  | ReturnType<typeof createClient<Database>>
  | null = null;

export function getSupabaseServerClient() {
  if (cached) return cached;

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");

  const supabaseKey  =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    getRequiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY");

  cached = createClient<Database>(supabaseUrl, supabaseKey , {
    auth: { persistSession: false },
  });

  return cached;
}
