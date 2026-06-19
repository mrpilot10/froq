import "server-only";

import { createClient } from "@supabase/supabase-js";

// Service-role client that bypasses RLS. Use ONLY in trusted server code
// (e.g. provisioning a merchant during onboarding). Never import in the browser.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
