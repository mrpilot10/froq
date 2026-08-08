import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { costInrForSmsSend } from "@/lib/notifications/sms-pricing";

/** Best-effort SMS metering — never throws into the send path. */
export function persistSmsSend(event: {
  status: "sent" | "failed";
  mobile?: string | null;
  templateId?: string | null;
  merchantId?: string | null;
  providerStatus?: string | number | null;
  providerMessage?: string | null;
  requestId?: string | null;
  bodyChars?: number | null;
}): void {
  void (async () => {
    try {
      const digits = (event.mobile ?? "").replace(/\D/g, "");
      const phoneLast4 = digits.length >= 4 ? digits.slice(-4) : null;
      const admin = createAdminClient();
      const { error } = await admin.from("sms_send_log").insert({
        merchant_id: event.merchantId ?? null,
        template_id: event.templateId ?? null,
        cost_inr: costInrForSmsSend(event.status),
        status: event.status,
        phone_last4: phoneLast4,
        provider_status:
          event.providerStatus == null ? null : String(event.providerStatus),
        provider_message: event.providerMessage?.slice(0, 500) ?? null,
        request_id: event.requestId ?? null,
        body_chars: event.bodyChars ?? null,
      });
      if (error) {
        console.error(
          JSON.stringify({
            scope: "sms",
            event: "sms_log_write_failed",
            message: error.message,
            at: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      console.error(
        JSON.stringify({
          scope: "sms",
          event: "sms_log_write_failed",
          message: error instanceof Error ? error.message : "unknown",
          at: new Date().toISOString(),
        }),
      );
    }
  })();
}
