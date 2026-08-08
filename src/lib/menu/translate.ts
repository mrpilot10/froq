import "server-only";

import { createHash } from "node:crypto";

import { generateAiText } from "@/lib/ai/gemini";
import { parseJsonFromAiText } from "@/lib/ai/parse-json";
import { type MenuLanguage, TRANSLATABLE_LANGS } from "./languages";

/**
 * Menu text is translated once and stored, never on the guest's request: the
 * guest page is served `no-store`, so translating inline would put a model call
 * in front of every scan of the QR code.
 */

/** Records per model call. Small enough that one bad reply loses little work. */
const CHUNK = 12;
/** Model calls in flight at once, across all languages. */
const CONCURRENCY = 4;

export interface TranslatableRecord {
  id: string;
  /** Field name to English text, e.g. `{ name, description }`. */
  fields: Record<string, string>;
}

export type TranslatedFields = Record<string, string>;

/**
 * Identifies the English a translation was made from. Stored next to the
 * translations so an edited dish can be spotted and redone.
 */
export function sourceHash(fields: Record<string, string>): string {
  const stable = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key] ?? ""}`)
    .join("\u0000");
  return createHash("sha256").update(stable).digest("hex").slice(0, 16);
}

function systemPrompt(lang: MenuLanguage): string {
  return [
    `You translate restaurant menus from English into ${lang.name}.`,
    "",
    "Reply with ONLY a JSON array, one object per input object, in the same",
    'order, each keeping its "i" value: [{"i":0,"name":"...","description":"..."}]',
    "",
    "Rules:",
    `- Write every value in ${lang.name}, in its own script. Never leave a value`,
    "  in English and never mix scripts inside one value.",
    "- Dish names: translate the words that describe food (chicken, grilled,",
    "  cheese, spicy). Write brand names, place names and invented product names",
    "  phonetically in the target script instead of translating their meaning,",
    "  so a guest can still say the name out loud to a server.",
    "- Translate the meaning, not word by word. The result must read as though a",
    "  local wrote the menu.",
    "- Keep every number, price and unit exactly as given (₹120 stays ₹120,",
    '  "10 min" keeps the 10). Translate the unit word itself.',
    "- Keep bracketed qualifiers such as (Regular) or (Large), translated.",
    "- Add nothing. Remove nothing. Never describe a taste, texture or",
    "  ingredient the English text does not state, and never drop a stated one.",
    "- Return every field you were given, even if the translation matches the",
    "  input. Never add fields.",
    "- No markdown fences, no commentary, only the JSON array.",
  ].join("\n");
}

interface ChunkReply {
  i?: number;
  [field: string]: unknown;
}

async function translateChunk(
  records: TranslatableRecord[],
  lang: MenuLanguage,
  merchantId?: string | null,
): Promise<Map<string, TranslatedFields>> {
  const payload = records.map((record, index) => ({ i: index, ...record.fields }));

  const result = await generateAiText({
    feature: "menu_translate",
    merchantId,
    system: systemPrompt(lang),
    messages: [
      {
        role: "user",
        text: [
          `Translate into ${lang.name}.`,
          JSON.stringify(payload),
        ].join("\n"),
      },
    ],
    // A translation is a restatement; warmth here shows up as embellishment.
    temperature: 0.2,
    thinkingLevel: "minimal",
    // Indic scripts cost far more tokens per character than the English input,
    // so the ceiling is generous relative to how little text goes in.
    maxOutputTokens: 4_096,
    timeoutMs: 60_000,
  });

  const parsed = parseJsonFromAiText<ChunkReply[]>(result.text);
  const out = new Map<string, TranslatedFields>();
  if (!Array.isArray(parsed)) return out;

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const index = typeof entry.i === "number" ? entry.i : NaN;
    const record = records[index];
    if (!record) continue;

    const fields: TranslatedFields = {};
    for (const key of Object.keys(record.fields)) {
      const value = entry[key];
      // A field the model dropped, blanked or echoed back untranslated is left
      // out: the read path falls back to English, which beats a half-filled card.
      if (typeof value !== "string") continue;
      const text = value.trim();
      if (!text || text === record.fields[key]?.trim()) continue;
      fields[key] = text;
    }
    if (Object.keys(fields).length > 0) out.set(record.id, fields);
  }
  return out;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Runs `worker` over `jobs`, at most CONCURRENCY at a time. */
async function pooled<T>(jobs: Array<() => Promise<T>>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      // One failed chunk must not lose the rest: the rows it covered keep their
      // stale hash and get picked up the next time translation runs.
      await job().catch(() => undefined);
    }
  });
  await Promise.all(runners);
}

export type TranslationsByLang = Record<string, TranslatedFields>;

/**
 * Translates every record into every supported language.
 *
 * Returns record id to `{ [langCode]: fields }`. A language or chunk the model
 * failed on is simply absent, so callers must merge rather than replace.
 */
export async function translateRecords(
  records: readonly TranslatableRecord[],
  langs: readonly MenuLanguage[] = TRANSLATABLE_LANGS,
  merchantId?: string | null,
): Promise<Map<string, TranslationsByLang>> {
  const merged = new Map<string, TranslationsByLang>();
  if (records.length === 0) return merged;

  const jobs: Array<() => Promise<void>> = [];
  for (const lang of langs) {
    for (const part of chunk(records, CHUNK)) {
      jobs.push(async () => {
        const translated = await translateChunk(part, lang, merchantId);
        for (const [id, fields] of translated) {
          const entry = merged.get(id) ?? {};
          entry[lang.code] = fields;
          merged.set(id, entry);
        }
      });
    }
  }

  await pooled(jobs);
  return merged;
}
