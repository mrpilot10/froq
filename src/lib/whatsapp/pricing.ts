/**
 * Meta WhatsApp India conversation rates (₹ per conversation).
 * Source: Meta pricing card (India) — captured 2026-08-07.
 *
 * Froq bills these per successful message send (user-selected model),
 * which can over-count vs Meta’s true 24h conversation windows.
 */

import type { WhatsAppTemplateCategory } from "@/lib/whatsapp/templates/categories";

export const WHATSAPP_INDIA_RATE_INR = {
  MARKETING: 0.9531,
  UTILITY: 0.15,
  AUTHENTICATION: 0.155,
} as const satisfies Record<WhatsAppTemplateCategory, number>;

export const WHATSAPP_INDIA_RATE_UPDATED_AT = "2026-08-07";

export function costInrForWhatsAppCategory(
  category: WhatsAppTemplateCategory | null | undefined,
): number {
  if (!category) return 0;
  return WHATSAPP_INDIA_RATE_INR[category];
}
