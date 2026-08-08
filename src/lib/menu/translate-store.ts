import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { MenuTranslations } from "@/lib/supabase/database.types";
import { MENU_LANGUAGES, TRANSLATABLE_LANGS } from "./languages";
import {
  sourceHash,
  translateRecords,
  type TranslatableRecord,
  type TranslatedFields,
} from "./translate";

/**
 * Reads the merchant's guest-visible text, translates whatever has fallen
 * behind, and writes it back onto the row it came from.
 *
 * Safe to run more often than needed: a row whose stored hash still matches its
 * English text and which already has every language costs nothing.
 */

type Table = "menu_items" | "menu_categories" | "menu_offers";

interface Spec {
  table: Table;
  /** Columns holding guest-visible English, in the order the model sees them. */
  fields: string[];
}

const SPECS: Spec[] = [
  { table: "menu_items", fields: ["name", "description"] },
  { table: "menu_categories", fields: ["name"] },
  { table: "menu_offers", fields: ["badge", "title", "detail"] },
];

function readStored(value: unknown): MenuTranslations {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as MenuTranslations)
    : {};
}

/**
 * A row needs work when its English has changed since it was last translated,
 * or when a language has been added to the product since.
 */
function missingLangs(stored: MenuTranslations, hash: string): string[] {
  if (stored.src !== hash) return TRANSLATABLE_LANGS.map((lang) => lang.code);
  return TRANSLATABLE_LANGS.filter((lang) => {
    const entry = stored[lang.code];
    return !entry || typeof entry !== "object";
  }).map((lang) => lang.code);
}

interface Pending {
  record: TranslatableRecord;
  stored: MenuTranslations;
  hash: string;
  langs: Set<string>;
}

async function syncTable(merchantId: string, spec: Spec): Promise<number> {
  const admin = createAdminClient();
  const columns = ["id", ...spec.fields, "translations"].join(", ");
  const query = admin.from(spec.table).select(columns).eq("merchant_id", merchantId);
  // Drafts are merchant-only, so translating them spends on text no guest sees.
  // Publishing one runs this again, which is where it gets picked up.
  const { data, error } =
    spec.table === "menu_items" ? await query.eq("status", "live") : await query;
  if (error || !data) return 0;

  const pending: Pending[] = [];
  for (const raw of data as unknown as Array<Record<string, unknown>>) {
    const fields: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = raw[field];
      if (typeof value === "string" && value.trim()) fields[field] = value.trim();
    }
    if (Object.keys(fields).length === 0) continue;

    const stored = readStored(raw.translations);
    const hash = sourceHash(fields);
    const langs = missingLangs(stored, hash);
    if (langs.length === 0) continue;

    pending.push({
      record: { id: String(raw.id), fields },
      stored,
      hash,
      langs: new Set(langs),
    });
  }
  if (pending.length === 0) return 0;

  // Every row is sent for every language it is missing. Rows rarely disagree
  // about which languages those are, so this is one pass in practice.
  const wanted = TRANSLATABLE_LANGS.filter((lang) =>
    pending.some((row) => row.langs.has(lang.code)),
  );
  const translated = await translateRecords(
    pending.map((row) => row.record),
    wanted,
  );

  let written = 0;
  for (const row of pending) {
    const fresh = translated.get(row.record.id);
    if (!fresh) continue;

    // Rebuilt from the current hash so a stale language cannot survive an edit,
    // but languages this pass did not cover are carried over.
    const next: MenuTranslations = { src: row.hash };
    for (const lang of TRANSLATABLE_LANGS) {
      const incoming = fresh[lang.code];
      const kept = row.stored.src === row.hash ? row.stored[lang.code] : undefined;
      const value = incoming ?? kept;
      if (value && typeof value === "object") next[lang.code] = value as TranslatedFields;
    }

    const { error: writeError } = await admin
      .from(spec.table)
      .update({ translations: next })
      .eq("id", row.record.id)
      .eq("merchant_id", merchantId);
    if (!writeError) written += 1;
  }
  return written;
}

/** Translates everything guest-facing for one merchant that has fallen behind. */
export async function syncMenuTranslations(merchantId: string): Promise<number> {
  if (!merchantId || MENU_LANGUAGES.length < 2) return 0;
  let written = 0;
  for (const spec of SPECS) {
    written += await syncTable(merchantId, spec).catch(() => 0);
  }
  return written;
}
