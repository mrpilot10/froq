/**
 * Rewrites stored dish descriptions against the current prompt in
 * `src/lib/menu/enrich.ts`.
 *
 * The rules the model writes to have changed — copy is now capped at
 * MENU_DESC_MAX and may not claim a texture, method or serving style the dish
 * name doesn't establish. Descriptions written under the old rules are both too
 * long and full of invented detail, so they get replaced rather than trimmed:
 * cutting "deep-fried to a perfect golden-crisp" down to length keeps the part
 * that was made up.
 *
 * Cook time and heat are only filled in where the row has nothing, so a value
 * the merchant set by hand survives.
 *
 * Run: npx --yes tsx --conditions=react-server scripts/rewrite-menu-descriptions.ts [--dry] [--merchant <id>]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

const { generateDishDescription } = await import("../src/lib/menu/enrich");
const { MENU_DESC_MAX } = await import("../src/lib/menu/types");

/** Gentle on the worker; the whole menu still finishes in about a minute. */
const CONCURRENCY = 4;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const merchantFilter = args[args.indexOf("--merchant") + 1];
const onlyOverLimit = !args.includes("--all");

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface Row {
  id: string;
  name: string;
  description: string | null;
  prep_minutes: number | null;
  spice_level: number | null;
  category_id: string;
}

let query = db
  .from("menu_items")
  .select("id, name, description, prep_minutes, spice_level, category_id")
  .order("name");
if (args.includes("--merchant")) query = query.eq("merchant_id", merchantFilter);

const { data, error } = await query;
if (error) throw new Error(error.message);

const { data: categories } = await db.from("menu_categories").select("id, name");
const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name as string]));

const rows = (data ?? []) as Row[];
const targets = onlyOverLimit
  ? rows.filter((row) => (row.description ?? "").trim().length > MENU_DESC_MAX)
  : rows;

console.log(
  `${rows.length} dishes, ${targets.length} to rewrite` +
    (onlyOverLimit ? ` (over ${MENU_DESC_MAX} chars; pass --all to redo every dish)` : "") +
    (dryRun ? " — dry run, nothing will be saved" : ""),
);

let done = 0;
let failed = 0;

async function rewrite(row: Row) {
  const label = row.name;
  try {
    const result = await generateDishDescription({
      name: row.name,
      section: categoryName.get(row.category_id),
    });
    if (!result.description) {
      failed += 1;
      console.log(`  --  ${label}: model returned nothing, left alone`);
      return;
    }

    const patch: Record<string, unknown> = { description: result.description };
    // Only fill blanks — a time or heat the merchant set by hand stays put.
    if (row.prep_minutes == null && result.prepMinutes != null) patch.prep_minutes = result.prepMinutes;
    if (row.spice_level == null && result.spiceLevel != null) patch.spice_level = result.spiceLevel;

    if (!dryRun) {
      const { error: saveError } = await db.from("menu_items").update(patch).eq("id", row.id);
      if (saveError) throw new Error(saveError.message);
    }

    done += 1;
    console.log(`  ok  ${label} [${result.description.length}]\n      ${result.description}`);
  } catch (cause) {
    failed += 1;
    console.log(`  !!  ${label}: ${(cause as Error).message}`);
  }
}

const queue = [...targets];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await rewrite(next);
  }),
);

console.log(`\nrewrote ${done}, failed ${failed}`);
