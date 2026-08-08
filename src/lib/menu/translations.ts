import type { MenuTranslations } from "@/lib/supabase/database.types";

/**
 * Reading side of the `translations` column. Kept free of server imports so the
 * guest page, the assistant and tests can all use it.
 *
 * Every lookup falls back to the English it was given. A dish that has not been
 * translated yet, or whose translation went stale when the merchant edited it,
 * shows in English rather than disappearing or showing a half-translated card.
 */

export function readTranslations(value: unknown): MenuTranslations {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MenuTranslations)
    : {};
}

/** The stored fields for one language, or null when there are none to use. */
export function fieldsFor(
  translations: unknown,
  lang: string,
): Record<string, string> | null {
  if (!lang || lang === "EN") return null;
  const entry = readTranslations(translations)[lang];
  if (!entry || typeof entry !== "object") return null;
  return entry as Record<string, string>;
}

/** One field in the guest's language, falling back to the English passed in. */
export function translatedField(
  translations: unknown,
  lang: string,
  field: string,
  english: string,
): string {
  const value = fieldsFor(translations, lang)?.[field];
  return typeof value === "string" && value.trim() ? value : english;
}
