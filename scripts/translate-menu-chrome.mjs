/**
 * Translates the guest menu's fixed chrome — buttons, labels, toasts — into
 * every language in src/lib/menu/languages.json, and writes the result to
 * src/lib/menu/guest-app/chrome-i18n.json for the bundle build to inject.
 *
 * Dish text is translated per merchant and stored in the database; this covers
 * the strings that are the same for every restaurant, so it runs here once and
 * the output is committed rather than being regenerated at runtime.
 *
 *   node --env-file=.env.local scripts/translate-menu-chrome.mjs [--only=TE,KN]
 *
 * Existing translations are kept. Only missing language/key pairs are asked
 * for, so a rerun after adding a language or a string is cheap.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src", "lib", "menu", "guest-app", "chrome-strings.json");
const OUT = join(ROOT, "src", "lib", "menu", "guest-app", "chrome-i18n.json");
const LANGS = join(ROOT, "src", "lib", "menu", "languages.json");

const CHUNK = 25;

function endpoint() {
  const base = (process.env.AI_WORKER_URL || "").replace(/\/+$/, "");
  if (!base) throw new Error("AI_WORKER_URL is not set — run with --env-file=.env.local");
  return `${base}/ai/generate`;
}

function systemPrompt(lang) {
  return [
    `You translate the interface of a restaurant menu app into ${lang.name}.`,
    "",
    "Reply with ONLY a JSON object mapping each key you were given to its",
    'translation: {"add":"...","total":"..."}',
    "",
    "Rules:",
    `- Write every value in ${lang.name}, in its own script.`,
    "- These are buttons, labels and short notices. Keep them as short as the",
    "  English: a button label that grows into a sentence breaks the layout.",
    "- Placeholders in braces are filled in by the app. Copy {n}, {v}, {t}, {p},",
    "  {a}, {b} and {brand} through exactly, and put them where the sentence",
    "  needs them. Never translate, rename or drop a placeholder.",
    "- Keep the tone warm and plain, the way a good restaurant speaks to a guest.",
    "- Leave 'AI' as 'AI'. Keep ₹ and digits as they are.",
    "- Translate every key you were given and add no others.",
    "- No markdown fences, no commentary, only the JSON object.",
  ].join("\n");
}

async function translate(entries, lang) {
  const body = {
    model: "gemini-3.5-flash",
    system: systemPrompt(lang),
    messages: [
      {
        role: "user",
        text: `Translate these interface strings into ${lang.name}.\n${JSON.stringify(
          Object.fromEntries(entries),
        )}`,
      },
    ],
    temperature: 0.2,
    thinkingLevel: "minimal",
    maxOutputTokens: 4096,
  };

  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.AI_WORKER_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);

  const text = String(json.text || "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(text);

  const out = {};
  for (const [key, english] of entries) {
    const value = parsed[key];
    if (typeof value !== "string" || !value.trim()) continue;
    // A placeholder the model dropped would render as a hole in the sentence,
    // so that string is left untranslated rather than shipped broken.
    const holes = english.match(/\{\w+\}/g) ?? [];
    if (holes.some((hole) => !value.includes(hole))) continue;
    out[key] = value.trim();
  }
  return out;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function main() {
  const source = JSON.parse(readFileSync(SOURCE, "utf8"));
  const { languages } = JSON.parse(readFileSync(LANGS, "utf8"));
  const only = (process.argv.find((a) => a.startsWith("--only=")) || "")
    .replace("--only=", "")
    .split(",")
    .filter(Boolean)
    .map((c) => c.toUpperCase());

  const existing = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
  const result = { ...existing };

  const targets = languages.filter(
    (lang) => lang.code !== "EN" && (only.length === 0 || only.includes(lang.code)),
  );

  for (const lang of targets) {
    const have = result[lang.code] ?? {};
    const todo = Object.entries(source).filter(([key]) => !have[key]);
    if (todo.length === 0) {
      console.log(`${lang.code} ${lang.name.padEnd(11)} up to date`);
      continue;
    }

    const merged = { ...have };
    let failed = 0;
    for (const part of chunk(todo, CHUNK)) {
      try {
        Object.assign(merged, await translate(part, lang));
      } catch (error) {
        failed += part.length;
        console.warn(`  ${lang.code}: chunk failed — ${error.message}`);
      }
    }
    result[lang.code] = merged;
    const done = Object.keys(merged).length;
    console.log(
      `${lang.code} ${lang.name.padEnd(11)} ${done}/${Object.keys(source).length}` +
        (failed ? ` (${failed} failed)` : ""),
    );
  }

  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`\nwrote ${OUT}`);
}

await main();
