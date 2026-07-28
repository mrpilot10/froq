import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fetch as undiciFetch } from "undici";

/**
 * Bypass Next's patched global fetch for Supabase.
 * Workspace loads are always-fresh; the patched fetch was adding ~4s to every
 * .rpc() POST inside server-action fan-outs. Set SUPABASE_NATIVE_FETCH=0 to
 * revert for A/B. See audit notes on fetch-cache implications.
 */
const useNativeFetch = process.env.SUPABASE_NATIVE_FETCH !== "0";

// Request-scoped client for Server Components, Route Handlers and Server Actions.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore, the middleware
            // refreshes the session cookie on the next request.
          }
        },
      },
      ...(useNativeFetch
        ? {
            global: {
              // undici's fetch — not Next's patched globalThis.fetch
              fetch: undiciFetch as unknown as typeof globalThis.fetch,
            },
          }
        : {}),
    },
  );
}
