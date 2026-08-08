import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { costInrForEmail, costUsdForEmail } from "@/lib/email/pricing";

/** Best-effort Resend metering — never throws into the send path. */
export function persistEmailSend(event: {
  kind: string;
  status: "sent" | "failed";
  resendId?: string | null;
  to?: string | null;
  errorMessage?: string | null;
}): void {
  void (async () => {
    try {
      const to = event.to?.trim() ?? "";
      const at = to.lastIndexOf("@");
      const toDomain = at > 0 ? to.slice(at + 1).toLowerCase() : null;
      const admin = createAdminClient();
      const { error } = await admin.from("email_send_log").insert({
        kind: event.kind || "other",
        cost_usd: costUsdForEmail(event.status),
        cost_inr: costInrForEmail(event.status),
        status: event.status,
        resend_id: event.resendId ?? null,
        to_domain: toDomain,
        error_message: event.errorMessage?.slice(0, 500) ?? null,
      });
      if (error) {
        console.error(
          JSON.stringify({
            scope: "email",
            event: "email_log_write_failed",
            message: error.message,
            at: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "email",
          event: "email_log_write_failed",
          message: error instanceof Error ? error.message : "unknown",
          at: new Date().toISOString(),
        }),
      );
    }
  })();
}
