/**
 * Pure-function checks for menu field limits.
 * Run: npx --yes tsx src/lib/menu/types.test.ts
 */
import assert from "node:assert/strict";
import { fitMenuDescription, MENU_DESC_MAX } from "./types";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

section("copy that already fits is left exactly as written", () => {
  assert.equal(fitMenuDescription("Paneer cubes in a tomato gravy."), "Paneer cubes in a tomato gravy.");
  assert.equal(fitMenuDescription("   Spaced   out   copy. "), "Spaced out copy.");
  assert.equal(fitMenuDescription(""), "");
});

section("an overlong description falls back to its last whole sentence", () => {
  const first =
    "Potato fries tossed with salt and served hot in a paper cone, with a small pot of ketchup alongside for the table to share.";
  const long = `${first} A second sentence pushes this well past the ceiling and would otherwise be chopped in half.`;
  assert.ok(long.length > MENU_DESC_MAX);
  assert.equal(fitMenuDescription(long), first);
});

section("with no usable sentence break it stops at a whole word", () => {
  const long = `${"word ".repeat(60)}end`;
  const out = fitMenuDescription(long);
  assert.ok(out.length <= MENU_DESC_MAX + 1, `got ${out.length}`);
  assert.ok(out.endsWith("word…"), out.slice(-12));
  // Never mid-word, and never a dangling separator before the ellipsis.
  assert.ok(!/[\s,;:-]…$/.test(out));
});

section("an early full stop is ignored so the copy keeps its substance", () => {
  // "No." is a sentence break, but cutting there would leave nothing useful.
  const long = `No. ${"filler ".repeat(40)}tail`;
  const out = fitMenuDescription(long);
  assert.ok(out.length > 20, out);
  assert.ok(out.endsWith("…"), out.slice(-8));
});

section("the ceiling is respected for every length around the boundary", () => {
  for (let n = MENU_DESC_MAX - 5; n <= MENU_DESC_MAX + 40; n += 1) {
    const out = fitMenuDescription("ab ".repeat(n));
    assert.ok(out.length <= MENU_DESC_MAX + 1, `n=${n} produced ${out.length}`);
  }
});

console.log("\nall menu field limit checks passed");
