/**
 * Guest-facing assistant prose helpers.
 * Run: npx --yes tsx src/lib/menu/format-assistant-text.test.ts
 */
import assert from "node:assert/strict";
import {
  formatAssistantMessage,
  markAssistantEmphasis,
  normalizeRupeeAmounts,
  softenDashes,
  splitEmphasisParts,
  tidyLayout,
} from "./format-assistant-text";

function section(name: string, fn: () => void) {
  fn();
  console.log(`ok  ${name}`);
}

section("spelled-out rupees become ₹digits", () => {
  assert.equal(normalizeRupeeAmounts("for fifty rupees as a starter"), "for ₹50 as a starter");
  assert.equal(
    normalizeRupeeAmounts("one hundred and twenty rupees as a main"),
    "₹120 as a main",
  );
  assert.equal(normalizeRupeeAmounts("costs 80 rupees"), "costs ₹80");
  assert.equal(normalizeRupeeAmounts("Rs. 40 only"), "₹40 only");
});

section("dish names and prices get emphasis markers", () => {
  const marked = markAssistantEmphasis(
    "Try Cheesy Balls for fifty rupees and the Veg Masala Cheese Grill (Jumbo).",
    ["Cheesy Balls", "Veg Masala Cheese Grill (Jumbo)"],
  );
  assert.match(marked, /\*\*Cheesy Balls\*\*/);
  assert.match(marked, /\*\*Veg Masala Cheese Grill \(Jumbo\)\*\*/);
  assert.match(marked, /\*\*₹50\*\*/);
});

section("parts split bold and plain for the bubble", () => {
  const parts = splitEmphasisParts("Try **Cheesy Balls** for **₹50** tonight.");
  assert.deepEqual(parts, [
    { text: "Try ", bold: false, plain: true },
    { text: "Cheesy Balls", bold: true, plain: false },
    { text: " for ", bold: false, plain: true },
    { text: "₹50", bold: true, plain: false },
    { text: " tonight.", bold: false, plain: true },
  ]);
});

section("a dash used as a pause becomes how a host would say it", () => {
  assert.equal(
    softenDashes("Try the fries — they're the crispiest thing tonight."),
    "Try the fries, they're the crispiest thing tonight.",
  );
  assert.equal(softenDashes("Two mains - one dessert"), "Two mains, one dessert");
  assert.equal(softenDashes("Light, fresh – and quick"), "Light, fresh and quick");
  assert.equal(softenDashes("Happy to help. — Just say the word."), "Happy to help. Just say the word.");
});

section("a dash inside a word is a spelling, not a pause", () => {
  assert.equal(
    softenDashes("The Peri-Peri is gluten-free."),
    "The Peri-Peri is gluten-free.",
  );
});

section("a long answer keeps its paragraphs and gets one list marker", () => {
  assert.equal(
    tidyLayout("Happy to build that.\n\n  - Cheesy Balls at ₹120\n  * Peri Peri at ₹150\n1. Short rib"),
    "Happy to build that.\n\n• Cheesy Balls at ₹120\n• Peri Peri at ₹150\n• Short rib",
  );
  assert.equal(tidyLayout("One.\n\n\n\nTwo."), "One.\n\nTwo.");
});

section("a list line is never mistaken for a dash pause", () => {
  const { text } = formatAssistantMessage(
    "For the two of you:\n- Cheesy Balls, light and quick\n- Peri Peri, the hot one",
    ["Cheesy Balls", "Peri Peri"],
  );
  assert.equal(
    text,
    "For the two of you:\n• Cheesy Balls, light and quick\n• Peri Peri, the hot one",
  );
});

section("formatAssistantMessage returns clean text plus parts", () => {
  const { text, parts } = formatAssistantMessage("I recommend Cheesy Balls for fifty rupees.", [
    "Cheesy Balls",
  ]);
  assert.equal(text.includes("**"), false);
  assert.equal(text.includes("₹50"), true);
  assert.ok(parts.some((p) => p.bold && p.text === "Cheesy Balls"));
  assert.ok(parts.some((p) => p.bold && p.text === "₹50"));
});

console.log("\nall format-assistant-text checks passed");
