import { createClient } from "@supabase/supabase-js";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let cached:
  | ReturnType<typeof createClient>
  | null = null;

export function getSupabaseServerClient() {
  if (cached) return cached;

  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    getRequiredEnv("SUPABASE_URL");

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });

  return cached;
}

