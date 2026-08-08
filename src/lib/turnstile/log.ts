import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** Best-effort insert — never throws into the captcha path. */
export function recordTurnstileVerify(input: {
  status: "pass" | "fail" | "error" | "skipped";
  errorCodes?: string[];
  source?: string;
}): void {
  void (async () => {
    try {
      const admin = createAdminClient();
      await admin.from("turnstile_verify_log").insert({
        status: input.status,
        error_codes: input.errorCodes ?? [],
        source: input.source ?? null,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "turnstile",
          event: "verify_log_failed",
          message: error instanceof Error ? error.message : "unknown",
          at: new Date().toISOString(),
        }),
      );
    }
  })();
}
