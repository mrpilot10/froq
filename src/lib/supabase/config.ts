import "server-only";

/** True when real Supabase credentials appear to be configured (not placeholders). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  const looksPlaceholder =
    url.includes("YOUR-PROJECT") ||
    serviceKey.includes("your-service") ||
    anonKey.includes("your-anon");

  return url.startsWith("https://") && serviceKey.length > 20 && !looksPlaceholder;
}
