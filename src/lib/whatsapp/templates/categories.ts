/**
 * WhatsApp / Meta template categories as registered in API TXT.
 *
 * Keys are the approved Meta template names (or stable prefixes) from the
 * API TXT template catalog. Values are Meta conversation categories.
 *
 * Sourced from the API TXT account template list (2026-08-07).
 * Re-fetch from the provider dashboard / API when templates are renamed.
 */

export type WhatsAppTemplateCategory =
  | "AUTHENTICATION"
  | "UTILITY"
  | "MARKETING";

/** Canonical category labels for UI. */
export const WHATSAPP_CATEGORY_LABEL: Record<WhatsAppTemplateCategory, string> = {
  AUTHENTICATION: "Authentication",
  UTILITY: "Utility",
  MARKETING: "Marketing",
};

/**
 * Approved template name → category.
 * Names match API TXT / Meta exactly (not Froq runtime aliases).
 */
export const WHATSAPP_TEMPLATE_CATEGORIES = {
  otp: "AUTHENTICATION",

  queue_first_notify: "UTILITY",
  queue_first_notify_menu: "UTILITY",
  queue_call_now: "UTILITY",
  queue_reminders_1: "UTILITY",
  queue_reminder_2: "UTILITY",
  queue_3_reminder: "UTILITY",
  queue_seated: "UTILITY",
  seated_menu: "UTILITY",
  queue_customer_skipped: "MARKETING",

  reservation_request_received: "UTILITY",
  reservation_confirmed: "UTILITY",
  reservation_updated: "UTILITY",
  reservation_reminder: "UTILITY",
  reservation_declined: "MARKETING",

  loyaltycard_stamp_verified: "MARKETING",
  loyaltycard_reward_unlocked: "MARKETING",
  loyaltycard_reward_ready: "MARKETING",
  loyaltycard_reward_claimed: "MARKETING",
  birthday_bonus_stamp: "MARKETING",
} as const satisfies Record<string, WhatsAppTemplateCategory>;

export type ApitxtTemplateCatalogName = keyof typeof WHATSAPP_TEMPLATE_CATEGORIES;

/**
 * Runtime send names in Froq that differ slightly from the Meta catalog key.
 * Used so category lookup still works for `loyaltycard_stamp_verified_1`, etc.
 */
const RUNTIME_NAME_ALIASES: Record<string, ApitxtTemplateCatalogName> = {
  birthday_bonus_stamps: "birthday_bonus_stamp",
  loyaltycard_stamp_verified_1: "loyaltycard_stamp_verified",
  loyaltycard_reward_unlocked_no_wait_time: "loyaltycard_reward_unlocked",
  loyaltycard_reward_ready_wait_time: "loyaltycard_reward_ready",
  // Closest catalog sibling — confirm if Meta assigns a distinct category later.
  loyaltycard_stamp_collected_last_wait_time: "loyaltycard_reward_ready",
  // Legacy send name before Meta rename.
  queue_reminder_3: "queue_3_reminder",
};

export type WhatsAppTemplateCategoryRow = {
  name: string;
  category: WhatsAppTemplateCategory;
  label: string;
  catalogName: ApitxtTemplateCatalogName | null;
};

function normalizeCategory(
  value: string,
): WhatsAppTemplateCategory | null {
  const upper = value.trim().toUpperCase();
  if (upper === "AUTHENTICATION" || upper === "UTILITY" || upper === "MARKETING") {
    return upper;
  }
  return null;
}

/**
 * Resolve Meta category for a template name used at send time or in the catalog.
 */
export function categoryForWhatsAppTemplate(
  templateName: string,
): WhatsAppTemplateCategory | null {
  const name = templateName.trim();
  if (!name) return null;

  const alias = RUNTIME_NAME_ALIASES[name];
  if (alias) return WHATSAPP_TEMPLATE_CATEGORIES[alias];

  if (name in WHATSAPP_TEMPLATE_CATEGORIES) {
    return WHATSAPP_TEMPLATE_CATEGORIES[name as ApitxtTemplateCatalogName];
  }

  // Longest catalog prefix match (e.g. loyaltycard_stamp_verified_1 → …_verified).
  let best: ApitxtTemplateCatalogName | null = null;
  for (const key of Object.keys(WHATSAPP_TEMPLATE_CATEGORIES) as ApitxtTemplateCatalogName[]) {
    if (name === key || name.startsWith(`${key}_`)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? WHATSAPP_TEMPLATE_CATEGORIES[best] : null;
}

/** Flat list for admin / tooling, sorted by category then name. */
export function listWhatsAppTemplateCategories(): WhatsAppTemplateCategoryRow[] {
  const order: WhatsAppTemplateCategory[] = [
    "AUTHENTICATION",
    "UTILITY",
    "MARKETING",
  ];
  return (Object.entries(WHATSAPP_TEMPLATE_CATEGORIES) as Array<
    [ApitxtTemplateCatalogName, WhatsAppTemplateCategory]
  >)
    .map(([name, category]) => ({
      name,
      category,
      label: WHATSAPP_CATEGORY_LABEL[category],
      catalogName: name,
    }))
    .sort((a, b) => {
      const ca = order.indexOf(a.category) - order.indexOf(b.category);
      if (ca !== 0) return ca;
      return a.name.localeCompare(b.name);
    });
}

export function parseWhatsAppCategoryInput(value: string): WhatsAppTemplateCategory | null {
  return normalizeCategory(value);
}

export function countTemplatesByCategory(): Record<WhatsAppTemplateCategory, number> {
  const counts: Record<WhatsAppTemplateCategory, number> = {
    AUTHENTICATION: 0,
    UTILITY: 0,
    MARKETING: 0,
  };
  for (const category of Object.values(WHATSAPP_TEMPLATE_CATEGORIES)) {
    counts[category] += 1;
  }
  return counts;
}
