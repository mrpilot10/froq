import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  categoryForWhatsAppTemplate,
  type WhatsAppTemplateCategory,
} from "@/lib/whatsapp/templates/categories";
import { costInrForWhatsAppCategory } from "@/lib/whatsapp/pricing";

/**
 * Best-effort insert into whatsapp_message_log.
 * Never throws — metering must not break customer delivery.
 */
export async function persistWhatsAppMessage(event: {
  templateName: string;
  status: "sent" | "failed";
  mobile?: string | null;
  merchantId?: string | null;
  providerStatus?: string | number | null;
  providerMessage?: string | null;
  requestId?: string | null;
  source?: "sendWA" | "sendOTP";
  /** Override when category is known (e.g. otp always AUTHENTICATION). */
  category?: WhatsAppTemplateCategory | null;
}): Promise<void> {
  try {
    const category =
      event.category ?? categoryForWhatsAppTemplate(event.templateName) ?? null;
    const resolvedCategory = category ?? "UNKNOWN";
    const billed =
      event.status === "sent" ? costInrForWhatsAppCategory(category) : 0;

    const digits = (event.mobile ?? "").replace(/\D/g, "");
    const phoneLast4 = digits.length >= 4 ? digits.slice(-4) : null;

    const admin = createAdminClient();
    const { error } = await admin.from("whatsapp_message_log").insert({
      merchant_id: event.merchantId ?? null,
      template_name: event.templateName,
      category: resolvedCategory,
      cost_inr: billed,
      status: event.status,
      phone_last4: phoneLast4,
      provider_status:
        event.providerStatus == null ? null : String(event.providerStatus),
      provider_message: event.providerMessage?.slice(0, 500) ?? null,
      request_id: event.requestId ?? null,
      source: event.source ?? "sendWA",
    });

    if (error) {
      console.error(
        JSON.stringify({
          scope: "whatsapp",
          event: "message_log_write_failed",
          message: error.message,
          at: new Date().toISOString(),
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "whatsapp",
        event: "message_log_write_failed",
        message: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
  }
}
