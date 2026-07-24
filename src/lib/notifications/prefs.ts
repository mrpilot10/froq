import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { maskPhone, toCanonicalPhone, toSupabaseAuthPhone } from "@/lib/auth/otp/phone";

export type NotificationChannel = "sms" | "whatsapp";

/**
 * After a successful WhatsApp OTP verify: mark every customer row for this
 * phone/user as WhatsApp-capable and prefer WhatsApp for future notifications.
 * Also stores prefs on auth user_metadata so a later join_merchant picks them up.
 */
export async function markWhatsAppAvailableForPhone(input: {
  phone: string;
  userId?: string | null;
}): Promise<void> {
  const canonical = toCanonicalPhone(input.phone);
  if (!canonical) return;

  const admin = createAdminClient();
  const phoneVariants = Array.from(
    new Set([canonical, `+${canonical}`, toSupabaseAuthPhone(canonical)]),
  );

  const patch = {
    whatsapp_available: true,
    preferred_notification_channel: "whatsapp" as const,
  };

  try {
    if (input.userId) {
      await admin.from("customers").update(patch).eq("user_id", input.userId);
      const { data: existing } = await admin.auth.admin.getUserById(input.userId);
      await admin.auth.admin.updateUserById(input.userId, {
        user_metadata: {
          ...(existing.user?.user_metadata ?? {}),
          whatsapp_available: true,
          preferred_notification_channel: "whatsapp",
        },
      });
    }

    // Also match by phone in case user_id is not linked on every row yet.
    await admin.from("customers").update(patch).in("phone", phoneVariants);

    console.info(
      JSON.stringify({
        scope: "notifications",
        event: "whatsapp_available_marked",
        phone: maskPhone(canonical),
        userId: input.userId ?? null,
        at: new Date().toISOString(),
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        scope: "notifications",
        level: "error",
        event: "whatsapp_available_mark_failed",
        phone: maskPhone(canonical),
        reason: error instanceof Error ? error.message : "unknown",
        at: new Date().toISOString(),
      }),
    );
  }
}

/**
 * Apply auth user_metadata notification prefs onto a freshly joined customer.
 * No-op when WhatsApp was never proven.
 */
export async function applyNotificationPrefsFromAuth(input: {
  customerId: string;
  userId: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(input.userId);
    const meta = data.user?.user_metadata ?? {};
    if (meta.whatsapp_available !== true) return;

    await admin
      .from("customers")
      .update({
        whatsapp_available: true,
        preferred_notification_channel: "whatsapp",
      })
      .eq("id", input.customerId);
  } catch {
    // Best-effort — join already succeeded with SMS defaults.
  }
}
