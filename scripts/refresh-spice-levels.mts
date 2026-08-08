/**
 * Re-asks the model for heat on every dish. A prior write left most rows at 0
 * (not null), so the "fill blanks only" path never touched them — and Peri
 * Peri reading as mild-free is wrong.
 *
 * Diet tags and descriptions are left alone.
 *
 * Run: npx --yes tsx --conditions=react-server scripts/refresh-spice-levels.mts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
}

const { generateDishDescription } = await import("../src/lib/menu/enrich");

const CONCURRENCY = 4;
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const { data, error } = await db
  .from("menu_items")
  .select("id, name, category_id, spice_level")
  .order("name");
if (error) throw new Error(error.message);

const { data: categories } = await db.from("menu_categories").select("id, name");
const categoryName = new Map((categories ?? []).map((c) => [c.id, c.name as string]));

const rows = data ?? [];
console.log(`refreshing spice on ${rows.length} dishes`);

let done = 0;
let failed = 0;
const queue = [...rows];

async function one(row: (typeof rows)[number]) {
  try {
    const result = await generateDishDescription({
      name: row.name,
      section: categoryName.get(row.category_id),
    });
    // Null from the model means "no clue" — keep the existing value rather than
    // wiping a heat the merchant may have set.
    if (result.spiceLevel == null) {
      console.log(`  --  ${row.name}: no heat guess, left at ${row.spice_level}`);
      return;
    }
    const { error: saveError } = await db
      .from("menu_items")
      .update({ spice_level: result.spiceLevel })
      .eq("id", row.id);
    if (saveError) throw new Error(saveError.message);
    done += 1;
    console.log(`  ok  ${row.name}: ${row.spice_level} → ${result.spiceLevel}`);
  } catch (cause) {
    failed += 1;
    console.log(`  !!  ${row.name}: ${(cause as Error).message}`);
  }
}

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await one(next);
  }),
);

console.log(`\nupdated ${done}, failed ${failed}`);
