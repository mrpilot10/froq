import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client that bypasses RLS. Use ONLY in trusted server code
// (e.g. provisioning a merchant during onboarding). Never import in the browser.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRole) {
    throw new Error("Supabase service-role client is not configured.");
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
